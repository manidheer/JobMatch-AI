"""
JD Extractor service — Handles structured information extraction from job descriptions.
"""

import json
import logging
import hashlib
from time import perf_counter
from openai import AsyncOpenAI
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

_JD_CACHE_TTL_SECONDS = 60 * 30  # 30 minutes
_jd_cache: dict[str, tuple[float, dict]] = {}


def _cache_key_for_jd(text: str) -> str:
  return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


def _cache_get(cache_key: str) -> dict | None:
  cached = _jd_cache.get(cache_key)
  if not cached:
    return None
  ts, payload = cached
  if perf_counter() - ts > _JD_CACHE_TTL_SECONDS:
    _jd_cache.pop(cache_key, None)
    return None
  # Deep copy to avoid accidental mutation of cache entries.
  return json.loads(json.dumps(payload))


def _cache_set(cache_key: str, payload: dict) -> None:
  _jd_cache[cache_key] = (perf_counter(), json.loads(json.dumps(payload)))

# ─────────────────────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────────────────────

JD_EXTRACTION_PROMPT = """You are an expert job description analyst. Extract ALL information from the job description below into structured JSON.

CRITICAL RULES:
1. Capture skill names VERBATIM exactly as written — do NOT filter, correct, or skip any skill name.
   If the JD says "viu.js" extract "viu.js". If it says "Llama ai" extract "Llama ai".
   Even if you have never heard of a technology, extract it exactly as written.

2. Distinguish REQUIRED vs PREFERRED carefully.
   Required = explicitly stated as mandatory / must-have.
   Preferred = "nice to have", "bonus", "plus", "preferred", "ideally".
   When unclear, default to required.

3. If a field is not mentioned anywhere in the JD, set it to null.
   NEVER invent or assume values.

4. HARD RULE — Technical skills vs Soft skills separation:
   required_skills and preferred_skills MUST contain ONLY hard/technical skills:
     ✅ KEEP in required_skills/preferred_skills: programming languages, frameworks, libraries,
        tools, platforms, databases, cloud services, protocols, specific methodologies (e.g. "Agile", "Scrum").
        Examples: "Python", "React", "PostgreSQL", "AWS", "Docker", "REST APIs", "viu.js", "Llama ai"
     ❌ NEVER put in required_skills/preferred_skills: interpersonal or behavioral traits.
        Examples: "communication", "teamwork", "collaboration", "leadership", "problem-solving",
        "attention to detail", "time management", "adaptability", "critical thinking",
        "self-motivated", "fast learner", "team player", "ownership", "stakeholder management",
        "written communication", "verbal communication", "interpersonal skills"
   → All soft/interpersonal skills belong ONLY in culture.soft_skills. Never duplicate them
     into required_skills or preferred_skills.

5. Prose descriptions are NOT skills.
   "machine learning pipelines" = description of work, NOT a skill.
   "PyTorch" = a skill.

6. Extract technical skills from ALL sections — body text, responsibilities, requirements, tech stacks.

Return ONLY a valid JSON object with this exact schema:

{
  "role": {
    "job_title": "string or null",
    "company_name": "string or null",
    "department": "string or null",
    "location": "string or null",
    "remote_policy": "remote|hybrid|onsite|null",
    "employment_type": "full-time|part-time|contract|internship|null",
    "job_summary": "2-3 sentence overview of the role"
  },
  "technical": {
    "required_skills": ["atomic TECHNICAL skill names only, verbatim — NO soft skills here"],
    "preferred_skills": ["nice-to-have TECHNICAL skill names only, verbatim — NO soft skills here"],
    "all_technologies": ["union of all tech mentioned, required or preferred"],
    "technical_experience_notes": "string describing required technical depth, or null"
  },
  "experience": {
    "years_min": 0,
    "years_max": null,
    "seniority_level": "junior|mid|senior|staff|principal|lead|null",
    "domain_experience": ["e.g. fintech, healthcare, startup, or empty array"],
    "leadership_required": false,
    "leadership_description": "string or null"
  },
  "education": {
    "degree_required": "none|associate|bachelor|master|phd|null",
    "degree_preferred": "none|associate|bachelor|master|phd|null",
    "fields_of_study": ["Computer Science", "Information Systems"],
    "certifications_required": [],
    "certifications_preferred": []
  },
  "culture": {
    "soft_skills": ["ALL interpersonal/behavioral traits go here — communication, teamwork, leadership, etc."],
    "culture_signals": "string describing company/team culture, or null",
    "work_style": "string describing how work is done, or null",
    "team_context": "string about team size/structure, or null"
  },
  "eligibility": {
    "visa_sponsorship": null,
    "visa_sponsorship_note": "exact text from JD about visa, or null",
    "work_authorization_required": "string or null",
    "security_clearance_required": "string or null",
    "citizenship_required": null,
    "citizenship_note": "exact text from JD, or null"
  },
  "compensation": {
    "salary_range": "string or null",
    "equity_mentioned": false,
    "benefits_highlights": []
  },
  "responsibilities": {
    "key_responsibilities": ["array of responsibility strings"],
    "key_achievements_expected": []
  },
  "recruiter_signals": {
    "urgency": "string or null",
    "application_instructions": "string or null",
    "red_flags": [],
    "important_notes": "any other important information not captured above, or null"
  }
}

Job Description:
"""

JD_VALIDATION_PROMPT = """You are a data quality validator for structured job description data.
A previous AI extracted information from a JD. Your job is to CLEAN and VALIDATE only — do NOT add new information that wasn't in the original JD.

TASKS:
1. ENFORCE the technical vs soft skill boundary.
   Scan required_skills and preferred_skills. If ANY soft/interpersonal trait is present, move it:
     - Remove it from required_skills / preferred_skills
     - Add it to culture.soft_skills (if not already there)
   Soft skill examples (not exhaustive): "communication", "teamwork", "collaboration",
   "leadership", "problem-solving", "attention to detail", "time management", "adaptability",
   "critical thinking", "self-motivated", "fast learner", "team player", "ownership",
   "stakeholder management", "written communication", "verbal communication", "interpersonal skills"
   RULE: When in doubt whether something is a technical skill or soft skill, KEEP it in the
         technical skill list. It is better to keep an unknown technical skill than to
         accidentally remove a real requirement. Only move something if you are confident
         it is interpersonal/behavioral.

2. SEPARATE prose phrases from atomic skills in required_skills and preferred_skills.
   PROSE (remove from skill lists, keep only in notes):
     "machine learning pipelines", "cloud-based infrastructure", "full-stack development",
     "api development", "scalable systems", "data-driven solutions", "end-to-end solutions"
   ATOMIC SKILLS (keep in skill lists):
     Specific tools, frameworks, languages, platforms: "PyTorch", "viu.js", "Angular", "Llama ai"
   RULE: When in doubt whether something is a skill or a phrase, KEEP it in the skill list.
         It is better to keep an unknown skill than to accidentally remove a real requirement.

3. Move any prose descriptions from required_skills/preferred_skills into
   technical.technical_experience_notes (append, don't overwrite).

4. Flag any TECHNICAL skill you don't recognise as unknown but KEEP it in the list.
   Add it to unknown_skills[] so the system knows to check it carefully.
   Do NOT flag soft skills that you moved out as unknown_skills.

5. Validate types:
   - years_min / years_max must be integers or null
   - visa_sponsorship must be true / false / null
   - citizenship_required must be true / false / null
   - remote_policy must be "remote", "hybrid", "onsite", or null
   - seniority_level must be one of the allowed enum values or null

6. Add validation_notes[] — a list of strings noting anything you changed or flagged.
   Specifically call out any soft skills you moved from technical lists to culture.soft_skills.

Return a JSON object with two top-level keys:
{
  "jd": { ...the cleaned JD object matching the original schema... },
  "unknown_skills": ["technical skills you don't recognise but kept"],
  "validation_notes": ["list of changes or flags you made"]
}

Extracted JD data to validate:
"""

# ─────────────────────────────────────────────────────────────────────────────
# Core logic
# ─────────────────────────────────────────────────────────────────────────────

async def _llm_json(prompt: str, max_tokens: int = 2000, label: str = "") -> dict:
    """Call the LLM and parse JSON response. Returns {} on any failure."""
    logger.debug("[%s] Calling LLM  model=%s  max_tokens=%d  prompt_chars=%d",
                 label, settings.OPENAI_MODEL, max_tokens, len(prompt))
    call_start = perf_counter()
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            seed=42,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content.strip()
        logger.debug("[%s] LLM response received  chars=%d", label, len(content))
        logger.info("[%s] LLM latency=%.2fs", label, perf_counter() - call_start)
        return json.loads(content)
    except Exception as e:
        logger.warning("[%s] LLM latency=%.2fs (failed)", label, perf_counter() - call_start)
        logger.error("[%s] LLM call failed: %s", label, e)
        return {}


def _enforce_soft_skill_boundary(jd: dict) -> list[str]:
    """
    Post-processing safety net: catches any soft skills that slipped through
    both LLMs and moves them from technical lists to culture.soft_skills.

    Returns a list of strings describing every move made.
    """
    KNOWN_SOFT_SKILLS = {
        "communication", "verbal communication", "written communication",
        "teamwork", "team player", "collaboration", "interpersonal skills",
        "leadership", "problem-solving", "problem solving", "critical thinking",
        "attention to detail", "time management", "adaptability", "flexibility",
        "self-motivated", "self motivated", "fast learner", "quick learner",
        "ownership", "accountability", "stakeholder management", "presentation skills",
        "empathy", "emotional intelligence", "conflict resolution", "negotiation",
        "organisational skills", "organizational skills", "multitasking",
        "work ethic", "proactive", "initiative", "creativity", "innovation",
        "mentoring", "coaching", "active listening",
    }

    moved: list[str] = []
    technical = jd.get("technical", {})
    culture = jd.setdefault("culture", {})
    soft_skills_set = set(s.lower() for s in culture.get("soft_skills", []))

    for field in ("required_skills", "preferred_skills"):
        original = technical.get(field, [])
        clean = []
        for skill in original:
            if skill.lower() in KNOWN_SOFT_SKILLS:
                if skill.lower() not in soft_skills_set:
                    culture.setdefault("soft_skills", []).append(skill)
                    soft_skills_set.add(skill.lower())
                moved.append(f"Moved '{skill}' from technical.{field} → culture.soft_skills")
                logger.info("[soft-skill-guard] %s", moved[-1])
            else:
                clean.append(skill)
        technical[field] = clean

    return moved


async def extract_jd(job_description: str) -> dict:
    """
    LLM 1: Extract ALL structured information from the raw JD text.
    Captures everything verbatim — skills, visa requirements, culture,
    compensation, recruiter notes — nothing is filtered or dropped.
    Technical skills and soft skills are extracted into separate fields.
    """
    total_start = perf_counter()
    cache_key = _cache_key_for_jd(job_description)
    cached = _cache_get(cache_key)
    if cached is not None:
      logger.info("[LLM1-extract] JD cache hit  chars=%d", len(job_description))
      return cached

    raw = await _llm_json(
        JD_EXTRACTION_PROMPT + "\n" + job_description[:10000],
        max_tokens=3000,
        label="LLM1-extract",
    )

    # Safe defaults for every section so downstream code never KeyErrors
    raw.setdefault("role",              {})
    raw.setdefault("technical",         {})
    raw.setdefault("experience",        {})
    raw.setdefault("education",         {})
    raw.setdefault("culture",           {})
    raw.setdefault("eligibility",       {})
    raw.setdefault("compensation",      {})
    raw.setdefault("responsibilities",  {})
    raw.setdefault("recruiter_signals", {})

    raw["technical"].setdefault("required_skills",  [])
    raw["technical"].setdefault("preferred_skills", [])
    raw["technical"].setdefault("all_technologies", [])
    raw["culture"].setdefault("soft_skills", [])
    raw["eligibility"].setdefault("visa_sponsorship",            None)
    raw["eligibility"].setdefault("visa_sponsorship_note",       None)
    raw["eligibility"].setdefault("work_authorization_required", None)
    raw["eligibility"].setdefault("security_clearance_required", None)
    raw["eligibility"].setdefault("citizenship_required",        None)

    # Safety net: catch any soft skills that leaked through LLM 1
    moved = _enforce_soft_skill_boundary(raw)
    if moved:
        logger.warning("[LLM1-extract] Soft skill boundary violations caught and fixed: %s", moved)

    req  = raw["technical"]["required_skills"]
    pref = raw["technical"]["preferred_skills"]
    soft = raw["culture"]["soft_skills"]
    logger.info(
        "[LLM1-extract] JD extraction complete — required=%d  preferred=%d  soft_skills=%d  role='%s'",
        len(req), len(pref), len(soft), raw["role"].get("job_title", "unknown"),
    )
    _cache_set(cache_key, raw)
    logger.info("[LLM1-extract] TOTAL latency=%.2fs", perf_counter() - total_start)
    return raw


async def validate_jd(extracted_jd: dict) -> dict:
    """
    LLM 2: Clean and validate LLM 1's output.
    - Enforces technical vs soft skill separation.
    - Separates prose phrases from atomic skills.
    - Flags unknown/novel technologies but keeps them.
    - Validates field types. Adds validation_notes.
    """
    result = await _llm_json(
        JD_VALIDATION_PROMPT + "\n" + json.dumps(extracted_jd, indent=2),
        max_tokens=3000,
        label="LLM2-validate",
    )

    if "jd" not in result:
        logger.warning("LLM2 validation failed — using raw LLM1 output")
        return {
            "jd": extracted_jd,
            "unknown_skills": [],
            "validation_notes": ["Validation step failed — using raw extraction"],
        }

    result.setdefault("unknown_skills",   [])
    result.setdefault("validation_notes", [])

    # Final safety net after LLM 2 as well
    moved = _enforce_soft_skill_boundary(result["jd"])
    if moved:
        result["validation_notes"].extend(moved)
        logger.warning("[LLM2-validate] Soft skill boundary violations caught post-validation: %s", moved)

    req  = result["jd"].get("technical", {}).get("required_skills",  [])
    pref = result["jd"].get("technical", {}).get("preferred_skills", [])
    soft = result["jd"].get("culture",   {}).get("soft_skills",       [])
    logger.info(
        "[LLM2-validate] Validation complete — required=%d  preferred=%d  soft_skills=%d  notes=%d",
        len(req), len(pref), len(soft), len(result["validation_notes"]),
    )
    return result
