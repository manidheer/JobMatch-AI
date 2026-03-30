"""
skill_matcher.py — Hybrid skill matcher: Python-first, LLM for edge cases only.

Pipeline:
  Layer 1 — Python normalisation (exact match after cleanup)
    Handles the easy majority: "Node.js" == "Node.js", "Python 3.11" == "Python",
    "ReactJS" == "React", "k8s" == "kubernetes" etc.
    Zero API calls. Runs in microseconds.

  Layer 2 — LLM alias check (only for skills Python couldn't match)
    Sends ONE batch LLM call asking: "for each of these unmatched JD skills,
    does any resume skill mean the same thing?"
    The LLM answers with its world knowledge — no alias map needed.
    This call is tiny because Python already handled the majority.
    temperature=0 + json_object = deterministic answer every time.

Why not embeddings?
  Embeddings answer "how similar are these sentences?" — probabilistic and
  noisy for short skill names. Java and JavaScript score 0.82. The LLM
  knows they are completely different technologies.

Why not LLM for everything?
  LLMs are unreliable for binary exact-match questions when doing them
  alongside 10 other tasks. Isolating the alias check into its own focused
  single-task call makes the answer reliable and fast.
"""

import json
import logging
import re
from dataclasses import dataclass, field

from openai import AsyncOpenAI
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


# ─────────────────────────────────────────────────────────────────────────────
# Layer 1 — Python normalisation
# ─────────────────────────────────────────────────────────────────────────────

# Hard-coded aliases resolved in Python before the LLM call.
# Maps normalised form → canonical normalised form.
_HARD_ALIASES: dict[str, str] = {
    # Kubernetes
    "k8s":                  "kubernetes",
    "k8":                   "kubernetes",
    # Databases
    "postgres":             "postgresql",
    "mongo":                "mongodb",
    "couch":                "couchdb",
    "elastic":              "elasticsearch",
    # JavaScript / TypeScript
    "js":                   "javascript",
    "ts":                   "typescript",
    "nodejs":               "node",
    "reactjs":              "react",
    "vuejs":                "vue",
    "nextjs":               "next",
    "nuxtjs":               "nuxt",
    "expressjs":            "express",
    # Python
    "py":                   "python",
    # ML shorthands
    "tf":                   "tensorflow",
    "sklearn":              "scikitlearn",
    "scikit":               "scikitlearn",
    "ml":                   "machinelearning",
    "dl":                   "deeplearning",
    "nlp":                  "naturallanguageprocessing",
    "cv":                   "computervision",
    "genai":                "generativeai",
    "llms":                 "llm",
    # Cloud / infra
    "gcp":                  "googlecloudplatform",
    "gke":                  "googlekubernetesengine",
    "ecs":                  "amazonecs",
    "eks":                  "amazoneks",
    "s3":                   "amazons3",
    # CI/CD
    "cicd":                 "ci/cd",
    "ci":                   "ci/cd",
    # Dotnet — dots are stripped by normaliser, so canonical form has no dot
    "dotnet":               "net",
    "dotnetcore":           "netcore",
    "aspnet":               "aspnet",
    "aspnetcore":           "aspnetcore",
    # Misc
    "dbs":                  "databases",
    "restapi":              "restapis",
    "restfulapi":           "restapis",
    "graphqlapi":           "graphql",
    "msg":                  "messagequeue",
}


def _normalise(skill: str) -> str:
    """
    Reduce a skill name to a stable comparison key.
      • Lowercase
      • Remove file-ext suffixes        ".js", ".ts", ".py" etc.
      • Remove dots, hyphens, spaces    "Node.js" → "nodejs"
      • Keep +, #, /                    "C++" and "C#" stay distinct
      • Apply hard alias map            "k8s" → "kubernetes", "nodejs" → "node"
      • Strip trailing version numbers  "Python311" → "python"  (last so aliases apply first)
    """
    s = skill.lower().strip()
    s = re.sub(r"\.(js|ts|py|rb|go|rs)$", "", s)     # strip file-ext suffixes
    s = s.replace(".", "").replace("-", "").replace(" ", "").strip()
    # Check aliases on punctuation-free form BEFORE version stripping
    # (so "k8s" → "kubernetes" not "k" after stripping trailing digit)
    if s in _HARD_ALIASES:
        return _HARD_ALIASES[s]
    s = re.sub(r"v?\d+(\.\d+)*$", "", s).strip()     # strip trailing versions
    return _HARD_ALIASES.get(s, s)


def _python_match(jd_skill: str, resume_normalised: set[str]) -> bool:
    """Exact match after normalisation."""
    return _normalise(jd_skill) in resume_normalised


# ─────────────────────────────────────────────────────────────────────────────
# Layer 2 — LLM alias check
# ─────────────────────────────────────────────────────────────────────────────

ALIAS_CHECK_PROMPT = """You are a technology skill alias checker.

For each JD skill below, check whether ANY skill in the resume list means
the same technology — considering all common aliases, abbreviations,
alternate spellings, and version variants.

Rules:
- "k8s" and "Kubernetes" → SAME
- "Postgres" and "PostgreSQL" → SAME
- "React.js" and "React" → SAME
- "Java" and "JavaScript" → DIFFERENT (completely different languages)
- "React" and "React Native" → DIFFERENT (different frameworks)
- "C" and "C++" → DIFFERENT
- ".NET Core" and ".NET" → SAME
- "ML" and "Machine Learning" → SAME
- Use your full knowledge of the tech industry to judge equivalence.

JD skills to check (these are the ones Python could NOT match exactly):
{unmatched_skills}

Resume skill list:
{resume_skills}

Return ONLY a valid JSON object where each key is a JD skill from the list
above and the value is either the matching resume skill string (if a match
was found) or null (if genuinely not present in the resume):

{{
  "JD skill 1": "matching resume skill or null",
  "JD skill 2": "matching resume skill or null"
}}

Be strict — only return a match if you are certain they refer to the same technology.
"""


async def _llm_alias_check(
    unmatched_jd_skills: list[str],
    resume_skills: list[str],
) -> dict[str, str | None]:
    """
    Ask the LLM to resolve aliases for skills Python couldn't match.
    Returns {jd_skill: matched_resume_skill} or {jd_skill: None}.
    """
    if not unmatched_jd_skills:
        return {}

    prompt = ALIAS_CHECK_PROMPT.format(
        unmatched_skills=json.dumps(unmatched_jd_skills, indent=2),
        resume_skills=json.dumps(resume_skills, indent=2),
    )

    logger.info(
        "[skill-match] LLM alias check — unmatched=%d  resume_pool=%d",
        len(unmatched_jd_skills), len(resume_skills),
    )

    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            seed=42,
            max_tokens=500,
            response_format={"type": "json_object"},
            timeout=settings.LLM_TIMEOUT,
        )
        content = response.choices[0].message.content.strip()
        result = json.loads(content)
        logger.debug("[skill-match] LLM alias result: %s", result)
        return result
    except Exception as e:
        logger.error(
            "[skill-match] LLM alias check failed: %s — treating all as unmatched", e
        )
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Result dataclass
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class SkillMatchResult:
    matched_required:  list[str] = field(default_factory=list)
    missing_required:  list[str] = field(default_factory=list)
    matched_preferred: list[str] = field(default_factory=list)
    missing_preferred: list[str] = field(default_factory=list)
    base_score:        int       = 0
    match_count:       int       = 0
    total_required:    int       = 0
    # {jd_skill: {"present": bool, "matched_by": str|None, "layer": "python"|"llm"}}
    match_details:     dict      = field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

async def hybrid_skill_match(
    resume_skills: list[str],
    jd_required:   list[str],
    jd_preferred:  list[str],
) -> SkillMatchResult:
    """
    Hybrid skill matcher — Python normalisation + LLM alias check.

    Args:
        resume_skills: flat list of atomic skill strings from the parsed resume
        jd_required:   required skills extracted from the JD
        jd_preferred:  preferred / nice-to-have skills from the JD

    Returns:
        SkillMatchResult with matched/missing lists and a deterministic base_score
    """
    if not jd_required and not jd_preferred:
        logger.warning("[skill-match] Both jd_required and jd_preferred are empty.")
        return SkillMatchResult()

    # Pre-build normalised resume set for O(1) Python matching
    resume_normalised: set[str] = {_normalise(s) for s in resume_skills if s.strip()}

    logger.info(
        "[skill-match] Starting  resume_skills=%d  jd_required=%d  jd_preferred=%d",
        len(resume_skills), len(jd_required), len(jd_preferred),
    )

    # ── Layer 1: Python exact match ───────────────────────────────────────────
    result = SkillMatchResult(total_required=len(jd_required))

    py_matched_req:   list[str] = []
    py_unmatched_req: list[str] = []
    py_matched_pref:  list[str] = []
    py_unmatched_pref: list[str] = []

    for skill in jd_required:
        if _python_match(skill, resume_normalised):
            py_matched_req.append(skill)
            result.match_details[skill] = {
                "present": True, "matched_by": skill, "layer": "python"
            }
        else:
            py_unmatched_req.append(skill)

    for skill in jd_preferred:
        if _python_match(skill, resume_normalised):
            py_matched_pref.append(skill)
        else:
            py_unmatched_pref.append(skill)

    # Deduplicate unmatched list while preserving order
    all_unmatched = list(dict.fromkeys(py_unmatched_req + py_unmatched_pref))

    logger.info(
        "[skill-match] Layer 1 (Python) — matched_req=%d  unmatched_req=%d  unmatched_pref=%d",
        len(py_matched_req), len(py_unmatched_req), len(py_unmatched_pref),
    )

    # ── Layer 2: LLM alias check for unmatched skills only ────────────────────
    llm_aliases: dict[str, str | None] = {}
    if all_unmatched:
        llm_aliases = await _llm_alias_check(all_unmatched, resume_skills)

    # ── Combine results ───────────────────────────────────────────────────────

    # Required
    result.matched_required = list(py_matched_req)
    for skill in py_unmatched_req:
        matched_by = llm_aliases.get(skill)
        # Guard against LLM returning the string "null" instead of JSON null
        if matched_by and matched_by != "null":
            result.matched_required.append(skill)
            result.match_details[skill] = {
                "present": True, "matched_by": matched_by, "layer": "llm"
            }
        else:
            result.missing_required.append(skill)
            result.match_details[skill] = {
                "present": False, "matched_by": None, "layer": "llm"
            }

    # Preferred
    result.matched_preferred = list(py_matched_pref)
    for skill in py_unmatched_pref:
        matched_by = llm_aliases.get(skill)
        if matched_by and matched_by != "null":
            result.matched_preferred.append(skill)
        else:
            result.missing_preferred.append(skill)

    # ── Score ─────────────────────────────────────────────────────────────────
    result.match_count = len(result.matched_required)
    req_pct  = result.match_count / max(len(jd_required), 1)
    pref_pct = (
        len(result.matched_preferred) / max(len(jd_preferred), 1)
        if jd_preferred else 1.0
    )
    result.base_score = round(req_pct * 70 + pref_pct * 30)

    logger.info(
        "[skill-match] FINAL — matched=%d/%d required  preferred=%d/%d  base_score=%d",
        result.match_count, result.total_required,
        len(result.matched_preferred), len(jd_preferred),
        result.base_score,
    )
    return result