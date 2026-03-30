"""
Resume optimizer — uses GPT to rewrite the resume to better
match a specific job, then generates a downloadable PDF.
"""
import json
import logging
import re
import hashlib
from time import perf_counter
from openai import AsyncOpenAI
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

_OPTIMIZE_CACHE_TTL_SECONDS = 60 * 20  # 20 minutes
_STRUCTURED_OPT_CACHE: dict[str, tuple[float, dict]] = {}
_SKILL_CATEG_CACHE: dict[str, tuple[float, dict[str, list[str]]]] = {}


def _cache_key(*parts: object) -> str:
    body = json.dumps(parts, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def _cache_get(cache: dict, key: str, ttl_seconds: int):
    cached = cache.get(key)
    if not cached:
        return None
    ts, payload = cached
    if perf_counter() - ts > ttl_seconds:
        cache.pop(key, None)
        return None
    return json.loads(json.dumps(payload))


def _cache_set(cache: dict, key: str, payload) -> None:
    cache[key] = (perf_counter(), json.loads(json.dumps(payload)))

OPTIMIZER_PROMPT = """You are an expert resume writer and career coach. 
Rewrite the following resume to better match the target job description.

STRICT RULES:
1. Rewrite bullet points using strong action verbs (Led, Built, Optimized, Reduced, Scaled, etc.) in one line
2. Add quantifiable results where plausible (e.g., "Reduced latency by 40%")
3. Insert missing skills ONLY if they are legitimately relatable to existing experience
4. Tailor the professional summary specifically for this role and company
5. Preserve ALL factual information: company names, job titles, dates, degrees, GPA
6. Use keywords from the job description naturally throughout (for ATS)
7. Keep the same overall structure — do not add fake jobs or fake companies
8. Output clean, plain text suitable for PDF generation

ORIGINAL RESUME:
{resume_text}

TARGET JOB DESCRIPTION:

{job_description}

MISSING SKILLS TO INCORPORATE (if legitimate):
{missing_skills}

Output the complete optimized resume text, starting directly with the candidate's name.
"""

COVER_LETTER_PROMPT = """You are a professional cover letter writer. Write a compelling, personalized cover letter.

Candidate: {candidate_name}
Professional Summary: {resume_summary}
Key Skills: {skills}
Target Job: {job_title} at {company}
Job Requirements: {job_summary}
Candidate's Strongest Matching Skills: {matched_skills}

Write a 3-paragraph professional cover letter that:
1. Opens with a strong, specific hook referencing the role and company — no generic "I am writing to apply"
2. Highlights 2-3 most relevant accomplishments with specific metrics
3. Closes with enthusiasm, a value proposition, and a clear call to action

Tone: Professional, confident, and warm. Avoid all clichés and buzzwords.
Output only the letter body (no "Dear Hiring Manager" header), starting from the opening paragraph.
"""

# ── Hardcoded Mani base skills (exact, never changed by LLM) ─────────────────
MANI_BASE_SKILLS = [
    "AI / Machine Learning: Python, PyTorch, LLMs, Generative AI (OpenAI, Anthropic, Gemini), RAG (LangChain, LlamaIndex), AI Agents (LangGraph, CrewAI), Prompt Engineering, DSPy, Embeddings, Semantic Search, MLflow",
    "Backend Development: C#, .NET 8, ASP.NET Core, FastAPI, Django, Node.js, REST APIs, GraphQL, Microservices, JWT/OAuth2 Auth",
    "Frontend Development: React, JavaScript, Next.js, TypeScript, Blazor WebAssembly, Tailwind CSS, Chart.js",
    "Databases & Data Systems: PostgreSQL (pgvector), SQL Server, MongoDB, Redis, Vector Databases (Pinecone, Chroma, FAISS), Entity Framework, SQLAlchemy",
    "Cloud & DevOps: AWS, Azure, Docker, Kubernetes, CI/CD, GitHub Actions, Terraform, Nginx",
    "Developer Tools: Git, Linux / Bash, Poetry, Pytest, LangSmith, Jupyter Notebook, TensorFlow",
]

DEFAULT_SKILLS_RULE = """
3. SKILLS — additive, keep all existing:
   a. Keep EVERY skill that appears in the original resume. Do NOT remove any.
   b. You may reorganize into logical categories.
   c. Add relevant skills from MISSING_SKILLS / RECOMMENDED_SKILLS (concrete tool names only).
   d. CONCRETE ONLY: real tech names (e.g. "Kafka", "TypeScript"). No soft skills or vague phrases.
   e. Output: list of "Category: skill1, skill2, ..." strings.
"""

# ── Skill categorizer prompt (small, cheap LLM call) ─────────────────────────
SKILL_CATEGORIZER_PROMPT = """Categorize each of the following skills/technologies into exactly one of these 6 categories:
- "AI / Machine Learning"
- "Backend Development"
- "Frontend Development"
- "Databases & Data Systems"
- "Cloud & DevOps"
- "Developer Tools"

RULES:
- Only include CONCRETE technology names (e.g. "Qdrant", "GCP", "Kafka"). Skip vague phrases.
- Assign each skill to the single most relevant category.
- If a skill doesn't clearly fit any category, skip it.

SKILLS TO CATEGORIZE:
{skills}

Return ONLY a valid JSON object with category names as keys and arrays of skill strings as values.
Only include categories that have at least one skill. No markdown, no explanation.
Example: {{"AI / Machine Learning": ["Qdrant"], "Cloud & DevOps": ["GCP"]}}
"""

OPTIMIZER_STRUCTURED_PROMPT = """You are an expert resume writer.
Optimize the following structured JSON resume to best match the target job description.

STRICT RULES:

1. HEADER — preserve exactly:
   - Copy name and contact_info EXACTLY as they appear in the original resume. Do NOT alter either field.

2. SUMMARY — keep length similar. Only tweak wording if truly necessary for this specific role.

3. SKILLS — output the skills array EXACTLY as provided in ORIGINAL RESUME (JSON). Do not change skills at all.

4. EXPERIENCE — keep first 4 bullets exactly, add 2 new ones (6 total per job):
   - For EACH job: output bullets[0], bullets[1], bullets[2], bullets[3] WORD-FOR-WORD from the original.
   - Generate 2 NEW JD-relevant bullets (bullets[4] and bullets[5]).
   - Total bullets per job = 6.
   - In the 2 new bullets, **bold** key JD keywords using **word** markdown syntax (e.g. "**LangChain**").
   - Each new bullet must be grounded in the tech stack visible in that job's existing bullets.
     Use only technologies consistent with what that job already demonstrates.
   - DO NOT introduce frameworks or tools that contradict the job's evident stack or predate 2018.

5. PROJECTS — keep the same total number of projects as the original:
   - First project: keep the description nearly as-is. Only lightly update wording if it helps
     reference a relevant JD skill naturally.
   - Last project: REPLACE entirely with a brand-new project.
     Base it on skills already present in the resume plus 1-2 skills from the JD.
     Provide: name, description (1-2 sentence plain paragraph), technologies (list).
     In the description, **bold** key JD keywords using **word** markdown syntax.
     Make it sound like a real personal/portfolio project, not a fake job.

6. EDUCATION — DO NOT change anything. Copy exactly from the original.

7. Return ONLY a valid JSON object — no markdown, no extra keys, matching this schema exactly:
   {{
     "name": "<copy from original — do not change>",
     "contact_info": "<copy from original — do not change>",
     "summary": "...",
     "skills": ["Category: skill1, skill2", ...],
     "experience": [{{"title": "", "company": "", "duration": "", "bullets": ["...", "...", "...", "...", "...", "..."]}}],
     "education": [{{"degree": "", "field": "", "institution": "", "year": ""}}],
     "projects": [{{"name": "", "description": "", "technologies": []}}]
   }}

8. DO NOT invent new jobs. Project count stays exactly as in the original.

TARGET JOB DESCRIPTION:
{job_description}

ORIGINAL RESUME (JSON):
{resume_json}
"""

OPTIMIZER_MAPPING_PROMPT = """You are an expert resume writer.
We are performing an in-place optimization of a resume to perfectly preserve its layout and formatting.
Below is a JSON object mapping paragraph IDs to their current text.

STRICT RULES:
1. Rewrite bullet points using strong action verbs (Led, Built, Optimized, etc.) and quantify results where plausible.
2. Insert missing skills ONLY if they naturally fit the existing experience.
3. Tailor the professional summary for this role.
4. EXACT MATCHING: You must return a JSON object with the EXACT SAME KEYS provided in the input. Do not add or remove any keys.
5. PRESERVE STRUCTURAL ITEMS: If a paragraph is just a name, date, company name, or simple heading (like "EXPERIENCE"), leave its text UNCHANGED or minimally updated.
6. Return ONLY valid JSON and no other text or explanation. No markdown code blocks (e.g., no ```json).

TARGET JOB DESCRIPTION:
{job_description}

MISSING SKILLS TO INCORPORATE:
{missing_skills}

ORIGINAL RESUME PARAGRAPHS (JSON):
{resume_json}
"""


async def generate_optimized_resume(
    resume_text: str,
    job_description: str,
    missing_skills: list[str],
) -> str:
    """
    Use GPT-4o-mini to rewrite the resume to better match the job.
    Returns the optimized resume as plain text.
    """
    prompt = OPTIMIZER_PROMPT.format(
        resume_text=resume_text[:10000],
        job_description=job_description[:6000],
        missing_skills=", ".join(missing_skills) if missing_skills else "None",
    )

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        max_tokens=4000,
        timeout=settings.LLM_TIMEOUT,
    )

    return response.choices[0].message.content.strip()


async def generate_optimized_resume_mapping(
    resume_mapping: dict,
    job_description: str,
    missing_skills: list[str],
) -> dict:
    """
    Use GPT to optimize a resume structured as a JSON mapping of
    paragraph_id -> text. Returns an optimized JSON mapping.
    """
    prompt = OPTIMIZER_MAPPING_PROMPT.format(
        resume_json=json.dumps(resume_mapping, indent=2),
        job_description=job_description[:6000],
        missing_skills=", ".join(missing_skills) if missing_skills else "None",
    )

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=4000,
        response_format={"type": "json_object"},
        timeout=settings.LLM_TIMEOUT,
    )

    content = response.choices[0].message.content.strip()
    try:
        optimized_mapping = json.loads(content)
        return optimized_mapping
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM mapping output: {e}\nContent: {content[:1000]}")
        # fallback to returning original mapping if fails
        return resume_mapping

# ── Skill enforcement helpers ─────────────────────────────────────────────────

# Vague phrases the LLM tends to invent — never valid as skill tags
_VAGUE_SKILL_FRAGMENTS = {
    "tooling", "practices", "workflows", "architectures", "systems",
    "pipelines", "calling", "agile", "stakeholder", "communication",
    "customer", "management", "engineering", "solution", "approach",
    "strategy", "methodology", "driven", "facing",
}

def _is_vague_skill(skill: str) -> bool:
    s = skill.strip().lower()
    # Reject if any fragment from the blocklist appears as a whole word
    words = set(re.split(r"[\s\-/]+", s))
    if words & _VAGUE_SKILL_FRAGMENTS:
        return True
    # Reject if longer than 3 words (phrases, not tool names)
    if len(s.split()) > 3:
        return True
    return False


def _build_mani_skills(categorized_new: dict[str, list[str]]) -> list[str]:
    """
    Returns MANI_BASE_SKILLS with any newly categorized skills appended at the end
    of the matching category line. Skills already present in the line are skipped.
    """
    result = []
    for line in MANI_BASE_SKILLS:
        cat = line.split(": ", 1)[0]
        new_for_cat = categorized_new.get(cat, [])
        line_lower = line.lower()
        fresh = [s for s in new_for_cat if s.lower() not in line_lower and not _is_vague_skill(s)]
        result.append(line + (", " + ", ".join(fresh) if fresh else ""))
    return result


async def _categorize_new_skills(missing_skills: list[str], recommended_skills: list[str]) -> dict[str, list[str]]:
    """
    Small LLM call: categorize missing + recommended skills into the 6 Mani categories.
    Returns a dict of {category: [skill, ...]}. Falls back to empty dict on failure.
    """
    all_skills = list(dict.fromkeys(missing_skills + recommended_skills))  # dedup, preserve order
    if not all_skills:
        return {}

    cache_key = _cache_key("categorize", settings.OPENAI_MODEL, all_skills)
    cached = _cache_get(_SKILL_CATEG_CACHE, cache_key, _OPTIMIZE_CACHE_TTL_SECONDS)
    if cached is not None:
        logger.info("[optimize] skill-categorizer cache hit  skills=%d", len(all_skills))
        return cached

    prompt = SKILL_CATEGORIZER_PROMPT.format(skills=", ".join(all_skills))
    call_start = perf_counter()
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=500,
            response_format={"type": "json_object"},
            timeout=settings.LLM_TIMEOUT,
        )
        categorized = json.loads(response.choices[0].message.content.strip())
        _cache_set(_SKILL_CATEG_CACHE, cache_key, categorized)
        logger.info("[optimize] skill-categorizer latency=%.2fs", perf_counter() - call_start)
        return categorized
    except Exception as e:
        logger.warning("[optimize] skill-categorizer latency=%.2fs (failed)", perf_counter() - call_start)
        logger.warning("Skill categorizer failed: %s", e)
        return {}




async def generate_structured_optimized_resume(
    resume_data: dict,
    job_description: str,
    missing_skills: list[str],
    recommended_skills: list[str] = [],
    template_type: str = "mani",
) -> dict:
    """
    Optimize a structured JSON resume to match a job description.

    For the 'mani' template:
    - Skills are HARDCODED (MANI_BASE_SKILLS) — LLM is not asked to touch them.
    - A separate small LLM call categorizes missing/recommended skills into the 6
      categories, then Python appends them to the base.
    - LLM only handles: summary, experience (keep 4 + add 2 new), projects.
    """
    total_start = perf_counter()
    cache_key = _cache_key(
        "structured-opt",
        settings.OPENAI_MODEL,
        template_type,
        resume_data,
        job_description[:6000],
        missing_skills,
        recommended_skills,
    )
    cached = _cache_get(_STRUCTURED_OPT_CACHE, cache_key, _OPTIMIZE_CACHE_TTL_SECONDS)
    if cached is not None:
        logger.info("[optimize] structured cache hit  template=%s", template_type)
        return cached

    if template_type == "mani":
        # ── 1. Build skills independently (cheap small call) ──────────────────
        step_start = perf_counter()
        categorized_new = await _categorize_new_skills(missing_skills, recommended_skills)
        mani_skills = _build_mani_skills(categorized_new)
        logger.info("[optimize] mani skill build latency=%.2fs", perf_counter() - step_start)

        # ── 2. Ask LLM only for summary, experience, projects (no skills rule) ─
        resume_for_llm = {**resume_data, "skills": mani_skills}
        prompt = OPTIMIZER_STRUCTURED_PROMPT.format(
            resume_json=json.dumps(resume_for_llm, indent=2),
            job_description=job_description[:6000],
        )
    else:
        prompt = OPTIMIZER_STRUCTURED_PROMPT.format(
            resume_json=json.dumps(resume_data, indent=2),
            job_description=job_description[:6000],
        )

    llm_start = perf_counter()
    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=4000,
        response_format={"type": "json_object"},
        timeout=settings.LLM_TIMEOUT,
    )
    logger.info("[optimize] structured llm latency=%.2fs", perf_counter() - llm_start)

    content = response.choices[0].message.content.strip()
    content = re.sub(r"^```(?:json)?\n?", "", content)
    content = re.sub(r"\n?```$", "", content)

    try:
        optimized_data = json.loads(content)
        for section in ["experience", "education", "projects"]:
            if section not in optimized_data or not isinstance(optimized_data[section], list):
                optimized_data[section] = resume_data.get(section, [])
        if "summary" not in optimized_data or not isinstance(optimized_data["summary"], str):
            optimized_data["summary"] = resume_data.get("summary", "")

        # Always use the Python-built skills for mani (ignore whatever LLM returned)
        if template_type == "mani":
            optimized_data["skills"] = mani_skills
        else:
            if "skills" not in optimized_data or not isinstance(optimized_data["skills"], list):
                optimized_data["skills"] = resume_data.get("skills", [])

        _cache_set(_STRUCTURED_OPT_CACHE, cache_key, optimized_data)
        logger.info("[optimize] structured total latency=%.2fs", perf_counter() - total_start)
        return optimized_data
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM structured output: {e}\nContent: {content[:1000]}")
        return resume_data

async def generate_cover_letter(
    resume: dict,
    job_title: str,
    company: str,
    job_description: str,
    matched_skills: list[str],
) -> str:
    """Generate a personalized cover letter using GPT."""
    # Try to extract candidate name from experience or summary
    candidate_name = "the candidate"
    if resume.get("experience"):
        # Often the name isn't in experience — use summary first line
        summary = resume.get("summary", "")
        if summary:
            candidate_name = summary.split("\n")[0][:50]

    prompt = COVER_LETTER_PROMPT.format(
        candidate_name=candidate_name,
        resume_summary=resume.get("summary", "")[:500],
        skills=", ".join(resume.get("skills", [])[:15]),
        job_title=job_title,
        company=company or "the company",
        job_summary=job_description[:1500],
        matched_skills=", ".join(matched_skills[:10]),
    )

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.6,
        max_tokens=1500,
        timeout=settings.LLM_TIMEOUT,
    )

    return response.choices[0].message.content.strip()
