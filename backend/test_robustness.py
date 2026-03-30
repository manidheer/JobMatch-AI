
import asyncio
import json
import logging
import sys
from pathlib import Path

# Add backend to sys.path
sys.path.append(str(Path(__file__).parent))

from app.services.resume_parser import parse_resume_with_llm, expand_skills
from app.services.ai_analyzer import analyze_match

# ─────────────────────────────────────────────────────────────────────────────
# MOCK RAW TEXTS (Simulating different resume structures)
# ─────────────────────────────────────────────────────────────────────────────

# 1. TABULAR/GRID STRUCTURE (Often tricky for parsers)
RESUME_TEXT_TABLES = """
Mani Dheer
AI ARCHITECT 

[SUMMARY]
Building scalable AI agents and RAG systems.

[TECHNICAL SKILLS GRID]
+-----------------+------------------------------------------+
| Category        | Technologies                             |
+-----------------+------------------------------------------+
| AI/ML           | LangChain, LangGraph, OpenAI, PyTorch    |
| Backend         | FastAPI, PostgreSQL (pgvector), Redis     |
| Cloud/DevOps    | AWS (S3, Lambda), Docker, Kubernetes     |
+-----------------+------------------------------------------+

[EXPERIENCE]
Senior Engineer at TechCorp (2020-2024)
- Led the migration of legacy systems to a microservices architecture using FastAPI.
- Implemented vector search for internal documents using pgvector.
"""

# 2. CATEGORY-HEAVY/DELIMITED STRUCTURE
RESUME_TEXT_CATEGORIES = """
Dheerreddy Nalla | AI/ML Specialist

Expertise:
PROGRAMMING: Python 3.11, JavaScript (ES6+), Go (Golang)
FRAMEWORKS: LangChain | LlamaIndex | React | Next.js
DATABASES: MongoDB, Pinecone (VectorDB), SQL Server
CLOUD: GCP (Google Cloud), Azure, TerraForm (IaC)

Profile:
Self-driven AI developer with 5 years experience building production-ready RAG pipelines.
"""

# 3. NARRATIVE/EMBEDDED STRUCTURE (No dedicated skills list)
RESUME_TEXT_NARRATIVE = """
Portfolio: Dheerreddy.ai

As a software craftsman, I have spent the last 4 years focusing on the intersection of AI and Infrastructure.
Most recently, I built an automated agent cluster using CrewAI and LangGraph that handles 10k requests/hour.
The stack was primarily Python-based, utilizing Django for the API layer and Redis for task queuing.
My deployment workflow is fully automated via GitHub Actions into Docker containers on AWS.
In my spare time, I contribute to open-source projects using Rust and C++.
"""

# ─────────────────────────────────────────────────────────────────────────────
# MOCK JOB DESCRIPTION
# ─────────────────────────────────────────────────────────────────────────────
MOCK_JD = """
AI System Engineer
Requirements:
- Strong Python and FastAPI experience
- Proficiency in AI agent frameworks: LangGraph or CrewAI
- Experience with Vector Databases (pgvector, Pinecone, or Chroma)
- AWS and Docker knowledge
"""

async def test_robustness():
    logging.basicConfig(level=logging.INFO)
    print("🧪 Starting Parsing & Analysis Robustness Test...")
    print("=" * 60)

    test_cases = [
        ("Tabular Grid", RESUME_TEXT_TABLES),
        ("Category Delimited", RESUME_TEXT_CATEGORIES),
        ("Narrative/Embedded", RESUME_TEXT_NARRATIVE)
    ]

    for name, text in test_cases:
        print(f"\n▶ TEST CASE: {name}")
        print("-" * 30)
        
        # 1. Test Extraction
        print(f"[{name}] Step 1: Extracting with LLM Parser...")
        resume_data = await parse_resume_with_llm(text)
        
        skills = resume_data.get("skills", [])
        print(f"[{name}] Skills Found: {len(skills)}")
        print(f"[{name}] Sample Skills: {skills[:8]}...")

        # 2. Test Analysis
        print(f"[{name}] Step 2: Running Match Analysis...")
        analysis = await analyze_match(resume_data, MOCK_JD)
        
        print(f"[{name}] Result: {analysis.get('match_score')}% - {analysis.get('match_label')}")
        print(f"[{name}] Matches: {analysis.get('matched_skills')}")
        print(f"[{name}] Gaps: {analysis.get('missing_skills')}")
        
        # specific validation for LangGraph (present in all or most)
        has_langgraph = any("LangGraph" in s for s in skills)
        if has_langgraph:
            print(f"✅ SUCCESS: LangGraph correctly extracted from {name} structure.")
        else:
            print(f"❌ WARNING: LangGraph not found in {name} extraction.")

    print("\n" + "=" * 60)
    print("Robustness Test Complete.")

if __name__ == "__main__":
    asyncio.run(test_robustness())
