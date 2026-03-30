"""
resume_parser.py — Extract text from PDF/DOCX, then use LLM to structure it.

Architecture:
  1. Text extraction  — pdfplumber (PDF) or python-docx (DOCX), preserving
     natural document order so table cells (skills tables) appear in the
     right place, not appended at the end.
  2. LLM parsing      — Single LLM call. Prompt explicitly requests a FLAT
     skill list so the LLM never bundles "AI/ML: Python, PyTorch" into one
     string. temperature=0 + response_format=json_object for determinism.
  3. Python normalizer — expand_skills() handles EVERYTHING the LLM might
     still get wrong:
       • "Category: skill1, skill2"  → individual atoms
       • "RAG (LangChain, LlamaIndex)" → RAG + LangChain + LlamaIndex
       • "PostgreSQL (pgvector)"       → PostgreSQL + pgvector
       • Deduplication (case-insensitive)
       • Strips junk characters
  4. The normalised flat list is what every downstream service receives.
     analyzer.py never sees category strings — only atomic skill names.
"""

import io
import json
import logging
import re
from pathlib import Path

import pdfplumber
from docx import Document
from openai import AsyncOpenAI

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


# ─────────────────────────────────────────────────────────────────────────────
# LLM prompt
# ─────────────────────────────────────────────────────────────────────────────

RESUME_EXTRACTION_PROMPT = """You are an expert resume parser. Extract structured information from the resume text below.

Return ONLY a valid JSON object with these exact keys:

- "name": string
- "contact_info": string  (email | phone | location, pipe-separated)
- "summary": string  (professional summary — extract verbatim if present, else write 2-3 sentences)
- "skills": array of strings
    RULES (CRITICAL):
    • Return EVERY individual skill, tool, framework, and technology found ANYWHERE in the resume
      — skills section, experience bullets, project descriptions, everywhere.
    • Each skill must be its OWN string. NEVER bundle multiple skills into one string.
    • CORRECT: ["Python", "FastAPI", "LangChain", "PostgreSQL", "Docker", "PyTorch"]
    • WRONG:   ["AI / Machine Learning: Python, FastAPI, LangChain"]
    • If you see "RAG (LangChain, LlamaIndex)" → emit: "RAG", "LangChain", "LlamaIndex"
    • If you see "PostgreSQL (pgvector)"        → emit: "PostgreSQL", "pgvector"
    • Preserve exact capitalisation from the resume (e.g. "CI/CD", ".NET 8", "Node.js")
    • Do NOT omit any skill, no matter how obvious or common
- "experience": array of objects with keys:
    "title", "company", "duration",
    "bullets": array of strings (one bullet per string, no bullet characters)
- "education": array of objects with keys:
    "institution", "degree", "field", "year"
- "projects": array of objects with keys:
    "name", "description",
    "technologies": array of strings,
    "bullets": array of strings

Return ONLY the JSON object. No markdown fences. No explanation.

Resume text:
{resume_text}
"""


# ─────────────────────────────────────────────────────────────────────────────
# Text extraction
# ─────────────────────────────────────────────────────────────────────────────

def _interleave_tables(doc: Document) -> list[str]:
    """
    Walk the raw XML body so table cells appear at their natural document
    position (right after the heading above them) instead of at the end.
    """
    from docx.oxml.ns import qn

    parts: list[str] = []
    for child in doc.element.body:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag

        if tag == "p":
            text = "".join(r.text or "" for r in child.iter(qn("w:t"))).strip()
            if text:
                parts.append(text)

        elif tag == "tbl":
            for tr in child.iter(qn("w:tr")):
                for tc in tr.iter(qn("w:tc")):
                    cell_lines: list[str] = []
                    for p in tc.iter(qn("w:p")):
                        line = "".join(
                            r.text or "" for r in p.iter(qn("w:t"))
                        ).strip()
                        if line:
                            cell_lines.append(line)
                    if cell_lines:
                        parts.append("\n".join(cell_lines))

    return parts


def _clean_text(raw: str) -> str:
    """Collapse alignment whitespace and tabs so the LLM sees clean text."""
    raw = re.sub(r" {3,}", "  ", raw)
    raw = raw.replace("\t", " ")
    raw = "\n".join(line.rstrip() for line in raw.splitlines())
    return raw


def extract_text_from_pdf(file_content: bytes) -> str:
    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(file_content)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                parts.append(page_text)
    return "\n\n".join(parts)


def extract_text_from_docx(file_content: bytes) -> str:
    doc = Document(io.BytesIO(file_content))
    parts = _interleave_tables(doc)
    return _clean_text("\n".join(parts))


def extract_text(file_content: bytes, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_content)
    elif ext in (".docx", ".doc"):
        return extract_text_from_docx(file_content)
    else:
        raise ValueError(f"Unsupported file type: {ext}")


# ─────────────────────────────────────────────────────────────────────────────
# Skill normalisation
# ─────────────────────────────────────────────────────────────────────────────

def _smart_split(text: str) -> list[str]:
    """
    Split comma-separated string while treating commas inside parentheses
    as literals.
      "Python, RAG (LangChain, LlamaIndex), Docker"
          → ["Python", "RAG (LangChain, LlamaIndex)", "Docker"]
    """
    tokens: list[str] = []
    depth = 0
    current: list[str] = []
    for ch in text:
        if ch == "(":
            depth += 1
            current.append(ch)
        elif ch == ")":
            depth = max(0, depth - 1)
            current.append(ch)
        elif ch == "," and depth == 0:
            token = "".join(current).strip()
            if token:
                tokens.append(token)
            current = []
        else:
            current.append(ch)
    tail = "".join(current).strip()
    if tail:
        tokens.append(tail)
    return tokens


def expand_skills(skills_raw: list) -> list[str]:
    """
    Normalise the LLM's skill list into a guaranteed-flat list of atomic
    skill name strings. Handles every format the LLM might produce:

    Format A — correct flat list:   ["Python", "FastAPI", "LangChain"]
    Format B — category strings:    ["AI/ML: Python, FastAPI, RAG (LangChain, LlamaIndex)"]
    Format C — parenthetical items: ["RAG (LangChain, LlamaIndex)", "PostgreSQL (pgvector)"]
    """
    flat: list[str] = []
    seen: set[str] = set()

    def _add(skill: str) -> None:
        skill = skill.strip().strip(",").strip()
        if skill and len(skill) > 1 and skill.lower() not in seen:
            flat.append(skill)
            seen.add(skill.lower())

    def _process_token(token: str) -> None:
        token = token.strip()
        if not token:
            return
        paren = re.match(r"^(.+?)\s*\(([^)]+)\)\s*$", token)
        if paren:
            _add(paren.group(1).strip())
            for sub in paren.group(2).split(","):
                _add(sub.strip())
        else:
            _add(token)

    for item in skills_raw:
        if not isinstance(item, str):
            continue
        item = item.strip()
        if not item:
            continue

        # Detect "Category: items" format
        if ":" in item:
            prefix, _, body = item.partition(":")
            if "," not in prefix and len(prefix.strip()) < 40:
                for t in _smart_split(body.strip()):
                    _process_token(t)
                continue

        tokens = _smart_split(item)
        if len(tokens) > 1:
            for t in tokens:
                _process_token(t)
        else:
            _process_token(item)

    return flat


# ─────────────────────────────────────────────────────────────────────────────
# LLM parsing
# ─────────────────────────────────────────────────────────────────────────────

async def parse_resume_with_llm(raw_text: str) -> dict:
    """
    Send resume text to the LLM → get back structured JSON.
    temperature=0 and response_format=json_object for deterministic output.
    """
    # 60,000 chars is ~15-20 dense pages (OpenAI handles 100k+ tokens easily, this is just a sanity cap)
    truncated = raw_text[:60000] if len(raw_text) > 60000 else raw_text
    prompt = RESUME_EXTRACTION_PROMPT.format(resume_text=truncated)

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        seed=42,
        max_tokens=16000,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content.strip()
    content = re.sub(r"^```(?:json)?\n?", "", content)
    content = re.sub(r"\n?```$", "", content)

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse LLM resume output: %s\nContent: %s", e, content[:500])
        parsed = {}

    parsed.setdefault("name",         "")
    parsed.setdefault("contact_info", "")
    parsed.setdefault("skills",       [])
    parsed.setdefault("experience",   [])
    parsed.setdefault("education",    [])
    parsed.setdefault("projects",     [])
    parsed.setdefault("summary",      "")

    # Guaranteed-flat atomic skill list
    parsed["skills"] = expand_skills(parsed.get("skills", []))

    parsed["raw_text"] = raw_text

    logger.info(
        "Parsed resume: %d skills, %d jobs, %d projects — candidate='%s'",
        len(parsed["skills"]),
        len(parsed["experience"]),
        len(parsed["projects"]),
        parsed.get("name", "unknown"),
    )
    return parsed