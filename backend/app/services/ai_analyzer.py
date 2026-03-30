"""
analyzer.py — Resume-to-JD match analysis engine.

Architecture (v7 — hybrid Python + LLM, single pipeline):

  Step 1  extract_jd()                [jd_extractor.py — unchanged]
    Raw JD text → structured JSON with required_skills, preferred_skills,
    role, experience, education, eligibility, culture, compensation.
    temperature=0 + json_object → deterministic every time.

  Step 2  hybrid_skill_match()        [skill_matcher.py]
    Layer 1 — Python normalisation: exact match after cleanup.
              Handles the majority instantly, zero API calls.
    Layer 2 — LLM alias check: ONE small focused call, only for the
              skills Python couldn't match. LLM uses its world knowledge
              to resolve k8s/Kubernetes, Postgres/PostgreSQL etc.
              temperature=0 → deterministic.
    Produces matched_required[], missing_required[], base_score.

  Step 3  LLM holistic analysis       [this file]
    Receives Step 2 facts as GROUND TRUTH — cannot contradict them.
    Focuses on what Python cannot do:
      • Experience depth & seniority assessment
      • Domain knowledge gaps
      • Culture fit
      • Eligibility flags (visa, clearance, location)
      • Actionable quick wins and recommendations
      • Holistic score (clamped ±8 around Python's base_score)
"""

import json
import logging
import hashlib
from time import perf_counter
from openai import AsyncOpenAI

from app.config import get_settings
from app.services.jd_extractor import extract_jd
from app.services.skill_matcher import hybrid_skill_match, SkillMatchResult
from app.services.resume_parser import expand_skills

logger = logging.getLogger(__name__)
settings = get_settings()
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

_ANALYSIS_CACHE_TTL_SECONDS = 60 * 20  # 20 minutes
_analysis_cache: dict[str, tuple[float, dict]] = {}


def _analysis_cache_key(
    resume_skills: list[str],
    experience: list,
    education: list,
    summary: str,
    job_description: str,
    mode: str,
    pre_extracted_jd: dict | None,
) -> str:
    payload = {
        "resume_skills": resume_skills,
        "experience": experience,
        "education": education,
        "summary": summary,
        "job_description": job_description,
        "mode": mode,
        "pre_extracted_jd": pre_extracted_jd,
        "model": settings.OPENAI_MODEL,
    }
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def _analysis_cache_get(cache_key: str) -> dict | None:
    cached = _analysis_cache.get(cache_key)
    if not cached:
        return None
    ts, payload = cached
    if perf_counter() - ts > _ANALYSIS_CACHE_TTL_SECONDS:
        _analysis_cache.pop(cache_key, None)
        return None
    return json.loads(json.dumps(payload))


def _analysis_cache_set(cache_key: str, payload: dict) -> None:
    _analysis_cache[cache_key] = (perf_counter(), json.loads(json.dumps(payload)))


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for s in items:
        s = s.strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            result.append(s)
    return result


def _experience_text(experience: list, max_chars: int = 4000) -> str:
    """Serialise experience list as clean plain text, never truncating mid-bullet."""
    lines, total = [], 0
    for exp in experience:
        block = (
            f"Role: {exp.get('title', '')} at {exp.get('company', '')} "
            f"({exp.get('duration', '')})\n"
        )
        for bullet in exp.get("bullets", []):
            block += f"  • {bullet}\n"
        block += "\n"
        if total + len(block) > max_chars:
            break
        lines.append(block)
        total += len(block)
    return "".join(lines) or "No experience data."


# ─────────────────────────────────────────────────────────────────────────────
# Learning resources
# ─────────────────────────────────────────────────────────────────────────────

LEARNING_RESOURCES: dict[str, list[dict]] = {
    # ── Infrastructure & Cloud ──────────────────────────────────────────────
    "kubernetes":       [
        {"title": "Kubernetes Official Docs",           "url": "https://kubernetes.io/docs/home/",                                              "type": "docs"},
        {"title": "KodeKloud Kubernetes for Beginners", "url": "https://kodekloud.com/courses/kubernetes-for-the-absolute-beginners-hands-on/", "type": "course"},
    ],
    "docker":           [{"title": "Docker Getting Started",                "url": "https://docs.docker.com/get-started/",                                  "type": "docs"}],
    "aws":              [{"title": "AWS Skill Builder (Free)",              "url": "https://skillbuilder.aws/",                                             "type": "course"}],
    "terraform":        [{"title": "HashiCorp Learn — Terraform",           "url": "https://developer.hashicorp.com/terraform/tutorials",                   "type": "tutorial"}],
    "ansible":          [{"title": "Ansible Getting Started",               "url": "https://docs.ansible.com/ansible/latest/getting_started/index.html",    "type": "docs"}],
    "helm":             [{"title": "Helm Docs",                             "url": "https://helm.sh/docs/",                                                 "type": "docs"}],
    "gcp":              [{"title": "Google Cloud Training (Free)",          "url": "https://cloud.google.com/training/free-labs",                           "type": "course"}],
    "azure":            [{"title": "Microsoft Learn — Azure",               "url": "https://learn.microsoft.com/en-us/azure/",                              "type": "course"}],
    "datadog":          [{"title": "Datadog Learning Center",               "url": "https://learn.datadoghq.com/",                                          "type": "course"}],
    "prometheus":       [{"title": "Prometheus Getting Started",            "url": "https://prometheus.io/docs/prometheus/latest/getting_started/",          "type": "docs"}],
    "grafana":          [{"title": "Grafana Tutorials",                     "url": "https://grafana.com/tutorials/",                                         "type": "tutorial"}],
    # ── Languages ───────────────────────────────────────────────────────────
    "go":               [{"title": "A Tour of Go",                          "url": "https://tour.golang.org/",                                              "type": "tutorial"}],
    "rust":             [{"title": "The Rust Book",                         "url": "https://doc.rust-lang.org/book/",                                       "type": "docs"}],
    "java":             [{"title": "Java Tutorials — Oracle",               "url": "https://docs.oracle.com/javase/tutorial/",                               "type": "tutorial"}],
    "kotlin":           [{"title": "Kotlin Docs",                           "url": "https://kotlinlang.org/docs/home.html",                                  "type": "docs"}],
    "scala":            [{"title": "Scala Tour",                            "url": "https://docs.scala-lang.org/tour/tour-of-scala.html",                    "type": "tutorial"}],
    "ruby":             [{"title": "Ruby Docs",                             "url": "https://www.ruby-lang.org/en/documentation/",                            "type": "docs"}],
    # ── Messaging & Streaming ────────────────────────────────────────────────
    "kafka":            [{"title": "Apache Kafka Quickstart",               "url": "https://kafka.apache.org/quickstart",                                    "type": "docs"}],
    "rabbitmq":         [{"title": "RabbitMQ Tutorials",                    "url": "https://www.rabbitmq.com/getstarted.html",                               "type": "tutorial"}],
    "redis":            [{"title": "Redis University (Free)",               "url": "https://university.redis.com/",                                          "type": "course"}],
    "celery":           [{"title": "Celery First Steps",                    "url": "https://docs.celeryq.dev/en/stable/getting-started/first-steps-with-celery.html", "type": "docs"}],
    # ── Data & ML ───────────────────────────────────────────────────────────
    "spark":            [{"title": "Apache Spark Docs",                     "url": "https://spark.apache.org/docs/latest/",                                  "type": "docs"}],
    "pytorch":          [{"title": "PyTorch Tutorials",                     "url": "https://pytorch.org/tutorials/",                                         "type": "tutorial"}],
    "tensorflow":       [
        {"title": "TensorFlow Tutorials",                                   "url": "https://www.tensorflow.org/tutorials",                                   "type": "tutorial"},
        {"title": "TF Developer Certificate",                               "url": "https://www.tensorflow.org/certificate",                                 "type": "course"},
    ],
    "mlflow":           [{"title": "MLflow Documentation",                  "url": "https://mlflow.org/docs/latest/index.html",                              "type": "docs"}],
    "langchain":        [{"title": "LangChain Python Docs",                 "url": "https://python.langchain.com/docs/",                                     "type": "docs"}],
    "langgraph":        [{"title": "LangGraph Docs",                        "url": "https://langchain-ai.github.io/langgraph/",                              "type": "docs"}],
    "llama":            [{"title": "Meta Llama Resources",                  "url": "https://ai.meta.com/llama/",                                             "type": "docs"}],
    "openai":           [{"title": "OpenAI API Docs",                       "url": "https://platform.openai.com/docs/",                                      "type": "docs"}],
    "huggingface":      [{"title": "Hugging Face Course (Free)",            "url": "https://huggingface.co/learn/nlp-course/",                               "type": "course"}],
    "dbt":              [{"title": "dbt Learn (Free)",                      "url": "https://courses.getdbt.com/courses/fundamentals",                         "type": "course"}],
    "airflow":          [{"title": "Airflow Official Docs",                 "url": "https://airflow.apache.org/docs/",                                        "type": "docs"}],
    "scikit-learn":     [{"title": "scikit-learn User Guide",               "url": "https://scikit-learn.org/stable/user_guide.html",                         "type": "docs"}],
    "pandas":           [{"title": "pandas Getting Started",                "url": "https://pandas.pydata.org/docs/getting_started/index.html",               "type": "docs"}],
    # ── Frontend ────────────────────────────────────────────────────────────
    "react":            [{"title": "React Official Docs",                   "url": "https://react.dev/learn",                                                "type": "docs"}],
    "typescript":       [{"title": "TypeScript Handbook",                   "url": "https://www.typescriptlang.org/docs/handbook/",                          "type": "docs"}],
    "graphql":          [{"title": "GraphQL.org Learn",                     "url": "https://graphql.org/learn/",                                             "type": "docs"}],
    "angular":          [{"title": "Angular Official Docs",                 "url": "https://angular.dev/",                                                   "type": "docs"}],
    "vue":              [{"title": "Vue.js Guide",                          "url": "https://vuejs.org/guide/introduction.html",                              "type": "docs"}],
    "next.js":          [{"title": "Next.js Docs",                          "url": "https://nextjs.org/docs",                                                "type": "docs"}],
    "svelte":           [{"title": "Svelte Tutorial",                       "url": "https://learn.svelte.dev/",                                              "type": "tutorial"}],
    # ── Backend & APIs ──────────────────────────────────────────────────────
    "fastapi":          [{"title": "FastAPI Docs",                          "url": "https://fastapi.tiangolo.com/",                                          "type": "docs"}],
    "django":           [{"title": "Django Tutorial",                       "url": "https://docs.djangoproject.com/en/stable/intro/tutorial01/",              "type": "tutorial"}],
    "flask":            [{"title": "Flask Quickstart",                      "url": "https://flask.palletsprojects.com/en/latest/quickstart/",                 "type": "docs"}],
    "spring":           [{"title": "Spring Guides",                         "url": "https://spring.io/guides",                                               "type": "tutorial"}],
    "grpc":             [{"title": "gRPC Python Quickstart",                "url": "https://grpc.io/docs/languages/python/quickstart/",                       "type": "tutorial"}],
    # ── Databases ───────────────────────────────────────────────────────────
    "postgresql":       [{"title": "PostgreSQL Tutorial",                   "url": "https://www.postgresqltutorial.com/",                                     "type": "tutorial"}],
    "mongodb":          [{"title": "MongoDB University (Free)",             "url": "https://learn.mongodb.com/",                                             "type": "course"}],
    "elasticsearch":    [{"title": "Elasticsearch Getting Started",         "url": "https://www.elastic.co/guide/en/elasticsearch/reference/current/getting-started.html", "type": "docs"}],
    "cassandra":        [{"title": "DataStax Cassandra Fundamentals",       "url": "https://datastax.com/learn/cassandra-fundamentals",                       "type": "course"}],
    "neo4j":            [{"title": "Neo4j GraphAcademy (Free)",             "url": "https://graphacademy.neo4j.com/",                                         "type": "course"}],
    # ── Security & Auth ─────────────────────────────────────────────────────
    "jwt":              [{"title": "JWT.io Introduction",                   "url": "https://jwt.io/introduction/",                                            "type": "docs"}],
    "oauth":            [{"title": "OAuth 2.0 Simplified",                  "url": "https://www.oauth.com/",                                                  "type": "docs"}],
}


def _get_learning_resources(missing_skills: list[str]) -> dict[str, list[dict]]:
    resources: dict[str, list[dict]] = {}
    for skill in missing_skills:
        key = skill.lower().strip()
        if key in LEARNING_RESOURCES:
            resources[skill] = LEARNING_RESOURCES[key]
            continue
        for db_key, links in LEARNING_RESOURCES.items():
            if db_key in key or key in db_key:
                resources[skill] = links
                break
    return resources


# ─────────────────────────────────────────────────────────────────────────────
# LLM prompt — holistic analysis only (skill facts come from Python)
# ─────────────────────────────────────────────────────────────────────────────

ANALYSIS_PROMPT = """You are a senior technical recruiter performing a holistic resume-to-job match analysis.

Python has already performed exact skill matching. The results below are GROUND TRUTH — you must not change, add to, or contradict them under any circumstances.

═══════════════════════════════════════════════════
PYTHON SKILL MATCH FACTS  (immutable — do not change)
═══════════════════════════════════════════════════
Base score (Python computed): {base_score}%
Matched skills ({match_count}/{total_required} required): {matched_skills}
Missing required skills: {missing_skills}

NOTE: If missing_skills is [], the candidate has ALL required skills.
Do NOT add anything to missing_skills. Python's list is final.

═══════════════════════════════════════════════════
CANDIDATE RESUME
═══════════════════════════════════════════════════
Name:     {candidate_name}
Location: {candidate_location}
Summary:  {candidate_summary}

Skills (full list):
{resume_skills_formatted}

Experience:
{resume_experience}

Education: {resume_education}

═══════════════════════════════════════════════════
JOB DESCRIPTION
═══════════════════════════════════════════════════
Role:           {job_title} at {company_name}
Location:       {job_location}
Remote policy:  {remote_policy}
Seniority:      {seniority_level}
Years required: {years_required}
Summary:        {job_summary}

Required skills:  {required_skills}
Preferred skills: {preferred_skills}

Education:          {education_required}
Visa sponsorship:   {visa_sponsorship}
Work authorization: {work_authorization}
Security clearance: {security_clearance}
Culture:            {culture_signals}
Domain experience:  {domain_experience}
Important notes:    {important_notes}

═══════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════
Perform holistic analysis covering everything Python cannot assess:
depth of experience, seniority fit, domain knowledge, culture alignment,
eligibility concerns, and actionable advice.

SCORING RULES:
• match_score MUST be an integer between {score_min} and {score_max} (±8 of Python base)
• Apply holistic reasoning — e.g. "PyTorch + MLflow + scikit-learn = ML pipeline experience"
  even if the exact phrase "ML pipelines" is not in the resume

Return ONLY valid JSON — no markdown, no explanation:
{{
  "match_score":        <integer {score_min}–{score_max}>,
  "match_label":        "Excellent Match|Strong Match|Good Match|Partial Match|Low Match",
  "semantic_match":     <float 0.0–1.0 representing how well the context/culture/domain fits beyond keywords>,
  "holistic_reasoning": "2–3 sentences explaining the score beyond the skill checklist",
  "strengths":          ["top 3–5 specific strengths for THIS role"],
  "experience_gaps":    ["gaps in depth, seniority, or domain — NOT individual skill names"],
  "culture_fit":        "brief assessment of fit with this team/company culture",
  "eligibility_flags":  ["visa, clearance, location concerns — empty [] if none"],
  "recommended_skills": ["atomic skill names NOT in resume that would strengthen the application"],
  "quick_wins":         ["1–3 small specific things the candidate can add or emphasise RIGHT NOW"]
}}

CONSTRAINTS:
• recommended_skills must NOT include any skill already in the candidate's resume
• recommended_skills must be atomic technology names only — no prose phrases
• experience_gaps should describe depth/domain/seniority gaps, not repeat missing skill names
• eligibility_flags must be [] if there are genuinely no concerns — do not invent flags
• If visa_sponsorship is false/null and candidate may need sponsorship, flag it
"""


# ─────────────────────────────────────────────────────────────────────────────
# LLM call helper
# ─────────────────────────────────────────────────────────────────────────────

async def _llm_json(prompt: str, max_tokens: int = 2000, label: str = "") -> dict:
    """Call LLM, parse JSON response. Returns {} on any failure."""
    logger.debug("[%s] Calling LLM  model=%s  tokens=%d  chars=%d",
                 label, settings.OPENAI_MODEL, max_tokens, len(prompt))
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            seed=42,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
            timeout=settings.LLM_TIMEOUT,
        )
        content = response.choices[0].message.content.strip()
        logger.debug("[%s] Response  chars=%d", label, len(content))
        return json.loads(content)
    except Exception as e:
        logger.error("[%s] LLM call failed: %s", label, e)
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

async def analyze_match(resume: dict, job_description: str, mode: str = "deep", pre_extracted_jd: dict = None) -> dict:
    """
    Full resume-to-JD match analysis.

    Steps:
      1. Extract structured JD         (1 LLM call, deterministic) - SKIPPED if pre_extracted_jd is provided
      2. Hybrid skill match             (Python + 1 small LLM alias call)
      3. Holistic LLM analysis          (1 LLM call, score clamped by Python)

    Args:
        resume:          Parsed resume dict from resume_parser.parse_resume_with_llm()
        job_description: Raw JD text string
        mode:            For future use (currently defaults to hybrid approach)
        pre_extracted_jd:Optional pre-extracted JD structured dict to save LLM calls

    Returns:
        dict with match_score, match_label, matched_skills, missing_skills,
        strengths, experience_gaps, culture_fit, eligibility_flags,
        recommended_skills, quick_wins, learning_resources,
        jd_structured, python_match_stats
    """

    total_start = perf_counter()

    # ── Step 0: Pre-process Skills (for backward compatibility with old parses) ──
    # Ensure any "Category: skill, skill" strings are exploded into atomic skills
    resume["skills"] = expand_skills(resume.get("skills", []))

    cache_key = _analysis_cache_key(
        resume_skills=resume.get("skills", []),
        experience=resume.get("experience", []),
        education=resume.get("education", []),
        summary=resume.get("summary", ""),
        job_description=job_description,
        mode=mode,
        pre_extracted_jd=pre_extracted_jd,
    )
    cached = _analysis_cache_get(cache_key)
    if cached is not None:
        logger.info("[analyze] CACHE HIT total_latency=%.2fs", perf_counter() - total_start)
        return cached

    # ── Step 1: Extract JD ────────────────────────────────────────────────────
    step_start = perf_counter()
    if pre_extracted_jd:
        logger.info("[analyze] STEP 1/3 — Using pre-extracted JD (Skipping LLM)")
        jd = pre_extracted_jd
    else:
        logger.info("[analyze] STEP 1/3 — Extracting JD  chars=%d", len(job_description))
        jd = await extract_jd(job_description)

    tech     = jd.get("technical",        {})
    role     = jd.get("role",             {})
    exp_jd   = jd.get("experience",       {})
    edu_jd   = jd.get("education",        {})
    culture  = jd.get("culture",          {})
    elig     = jd.get("eligibility",      {})
    signals  = jd.get("recruiter_signals",{})

    jd_required  = _dedupe(tech.get("required_skills",  []))
    jd_preferred = _dedupe(tech.get("preferred_skills", []))

    logger.info(
        "[analyze] STEP 1/3 — Done  required=%d  preferred=%d  role='%s'",
        len(jd_required), len(jd_preferred), role.get("job_title", "unknown"),
    )
    logger.info("[analyze] STEP 1/3 latency=%.2fs", perf_counter() - step_start)

    # ── Step 2: Hybrid skill match ────────────────────────────────────────────
    step_start = perf_counter()
    resume_skills = resume.get("skills", [])
    logger.info(
        "[analyze] STEP 2/3 — Hybrid skill match  resume_skills=%d  jd_required=%d",
        len(resume_skills), len(jd_required),
    )

    py: SkillMatchResult = await hybrid_skill_match(
        resume_skills, jd_required, jd_preferred
    )

    base_score = py.base_score
    score_min  = max(0,   base_score - 8)
    score_max  = min(100, base_score + 8)

    logger.info(
        "[analyze] STEP 2/3 — Done  matched=%d/%d  base_score=%d  range=[%d,%d] (±8 clamp)",
        py.match_count, py.total_required, base_score, score_min, score_max,
    )
    logger.info("[analyze]   matched : %s", py.matched_required)
    logger.info("[analyze]   missing : %s", py.missing_required)
    logger.info("[analyze] STEP 2/3 latency=%.2fs", perf_counter() - step_start)

    # ── Step 3: Holistic LLM analysis ────────────────────────────────────────
    step_start = perf_counter()
    years_req = (
        f"{exp_jd.get('years_min', 0)}+"
        if exp_jd.get("years_max") is None
        else f"{exp_jd.get('years_min', 0)}–{exp_jd.get('years_max')}"
    )

    resume_skills_formatted = (
        "\n".join(f"  • {s}" for s in resume_skills) or "  (none listed)"
    )

    prompt = ANALYSIS_PROMPT.format(
        base_score              = base_score,
        match_count             = py.match_count,
        total_required          = py.total_required,
        matched_skills          = json.dumps(py.matched_required),
        missing_skills          = json.dumps(py.missing_required),
        candidate_name          = resume.get("name",         "Candidate"),
        candidate_location      = resume.get("contact_info", ""),
        candidate_summary       = resume.get("summary",      ""),
        resume_skills_formatted = resume_skills_formatted,
        resume_experience       = _experience_text(resume.get("experience", [])),
        resume_education        = json.dumps(resume.get("education", [])),
        job_title               = role.get("job_title",       ""),
        company_name            = role.get("company_name",    ""),
        job_location            = role.get("location",        "Not specified"),
        remote_policy           = role.get("remote_policy",   "Not specified"),
        seniority_level         = exp_jd.get("seniority_level", "Not specified"),
        years_required          = years_req,
        job_summary             = role.get("job_summary",     ""),
        required_skills         = json.dumps(jd_required),
        preferred_skills        = json.dumps(jd_preferred),
        education_required      = edu_jd.get("degree_required", "Not specified"),
        visa_sponsorship        = elig.get("visa_sponsorship"),
        work_authorization      = elig.get("work_authorization_required", "Not specified"),
        security_clearance      = elig.get("security_clearance_required", "Not specified"),
        culture_signals         = culture.get("culture_signals",    "Not specified"),
        domain_experience       = json.dumps(exp_jd.get("domain_experience", [])),
        important_notes         = signals.get("important_notes",    "None"),
        score_min               = score_min,
        score_max               = score_max,
    )

    logger.info("[analyze] STEP 3/3 — Calling LLM for holistic analysis")
    llm_result = await _llm_json(prompt, max_tokens=2000, label="LLM-analyze")

    # Fallback if LLM fails
    if not llm_result:
        logger.warning("[analyze] LLM analysis failed — using Python facts only")
        llm_result = {
            "match_score":        base_score,
            "match_label":        "Unable to analyze",
            "holistic_reasoning": "Holistic analysis could not be completed.",
            "strengths":          [],
            "experience_gaps":    [],
            "culture_fit":        "",
            "eligibility_flags":  [],
            "recommended_skills": [],
            "quick_wins":         [],
            "semantic_match":     0.5
        }

    # ── Post-processing ───────────────────────────────────────────────────────

    # 0. Handle semantic match (displays as Semantic Context Match in UI)
    llm_result["semantic_boost"] = float(llm_result.get("semantic_match", 0.8))

    # 1. Python facts override LLM — matched/missing are non-negotiable
    llm_result["matched_skills"] = _dedupe(py.matched_required)
    llm_result["missing_skills"] = py.missing_required

    # 2. Clamp score to ±10 of Python base
    raw_score = int(llm_result.get("match_score", base_score))
    llm_result["match_score"] = max(score_min, min(score_max, raw_score))
    logger.info(
        "[analyze] Score: raw=%d  clamped=%d  range=[%d,%d]",
        raw_score, llm_result["match_score"], score_min, score_max,
    )

    # 3. Filter recommended_skills — remove anything already in the resume
    resume_lower = {s.lower().strip() for s in resume_skills}
    llm_result["recommended_skills"] = _dedupe([
        s for s in llm_result.get("recommended_skills", [])
        if s.strip().lower() not in resume_lower
    ])

    # 4. Ensure all list keys exist
    for key in ["matched_skills", "missing_skills", "recommended_skills",
                "experience_gaps", "eligibility_flags", "strengths", "quick_wins"]:
        llm_result.setdefault(key, [])

    # 5. Learning resources for missing required skills
    llm_result["learning_resources"] = _get_learning_resources(py.missing_required)

    # 6. Metadata for UI / debugging
    llm_result["jd_structured"] = jd
    llm_result["python_match_stats"] = {
        "matched_count":  py.match_count,
        "total_required": py.total_required,
        "base_score":     base_score,
        "score_range":    f"{score_min}–{score_max}",
        "match_details":  py.match_details,
    }
    llm_result["status"] = "analyzed"

    logger.info(
        "[analyze] ━━━ COMPLETE ━━━  score=%d  label='%s'  missing=%d  quick_wins=%d",
        llm_result["match_score"],
        llm_result.get("match_label", "?"),
        len(llm_result["missing_skills"]),
        len(llm_result.get("quick_wins", [])),
    )
    logger.info("[analyze] STEP 3/3 latency=%.2fs", perf_counter() - step_start)
    logger.info("[analyze] TOTAL latency=%.2fs", perf_counter() - total_start)
    _analysis_cache_set(cache_key, llm_result)
    return llm_result