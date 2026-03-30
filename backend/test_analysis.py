
import asyncio
import json
import logging
import sys
from pathlib import Path

# Add backend to sys.path
sys.path.append(str(Path(__file__).parent))

from app.services.ai_analyzer import analyze_match
from app.services.resume_parser import expand_skills

# Mock Resume Data
# This is a typical "parsed" resume output from resume_parser
MOCK_RESUME = {
    "name": "Dheerreddy Nalla",
    "contact_info": "manidheer@example.com | 555-0199 | Toronto, ON",
    "summary": "Experienced AI Engineer specializing in Generative AI and RAG applications.",
    "skills": [
        "Python", "PyTorch", "LLMs", "Generative AI", 
        "RAG (LangChain, LlamaIndex)", "AI Agents (LangGraph, CrewAI)",
        "FastAPI", "PostgreSQL (pgvector)", "Docker", "AWS"
    ],
    "experience": [
        {
            "title": "Senior AI Engineer",
            "company": "TechInnovate",
            "duration": "2022 - Present",
            "bullets": [
                "Built complex RAG pipelines using LangChain and LlamaIndex.",
                "Developed multi-agent systems with LangGraph for automation.",
                "Optimized vector search with pgvector on PostgreSQL."
            ]
        }
    ],
    "education": [
        {"institution": "University of Waterloo", "degree": "Masters", "field": "AI", "year": "2021"}
    ]
}

# Mock Job Description
MOCK_JD = """
Senior AI Engineer - Toronto (Remote Friendly)

We are looking for a Senior AI Engineer to join our team.

Required Skills:
- Python 3.11+
- Experience with LangChain and LangGraph
- Knowledge of Vector Databases like Pinecone or Chroma
- Strong understanding of LLMs and Generative AI
- API development with FastAPI

Preferred Skills:
- Kubernetes and Docker
- AWS (Lambda, SageMaker)
- Next.js for building AI interfaces

Requirements:
- 5+ years of experience in software engineering
- MS in Computer Science or related field
"""

async def run_test():
    logging.basicConfig(level=logging.INFO)
    print("🚀 Starting Analysis Feature Test...")
    
    # Pre-test check: see how skills expand
    print("\n[Step 0] Testing Skill Expansion...")
    expanded = expand_skills(MOCK_RESUME["skills"])
    print(f"Raw skills count: {len(MOCK_RESUME['skills'])}")
    print(f"Expanded skills: {expanded}")
    
    # Run full analysis
    print("\n[Step 1] Running full Hybrid Analysis...")
    result = await analyze_match(MOCK_RESUME, MOCK_JD)
    
    print("\n🔍 TEST RESULTS:")
    print("-" * 50)
    print(f"Score: {result.get('match_score')}% ({result.get('match_label')})")
    print(f"Matched Skills: {result.get('matched_skills')}")
    print(f"Missing Skills: {result.get('missing_skills')}")
    print(f"Reasoning: {result.get('holistic_reasoning')}")
    print(f"Recommended: {result.get('recommended_skills')}")
    print(f"Eligibility Flags: {result.get('eligibility_flags')}")
    
    # Assertions for "Solidness"
    print("\n🧪 VALIDATION CHECKS:")
    
    # 1. Check if "LangChain" and "LangGraph" are matched (they were nested in the resume)
    is_langchain_matched = "LangChain" in result.get('matched_skills', []) or any("LangChain" in s for s in result.get('matched_skills'))
    is_langgraph_matched = "LangGraph" in result.get('matched_skills', []) or any("LangGraph" in s for s in result.get('matched_skills'))
    
    if is_langchain_matched and is_langgraph_matched:
        print("✅ SUCCESS: Nested skills (LangChain/LangGraph) correctly identified.")
    else:
        print("❌ FAILURE: Nested skills missed.")
        
    # 2. Check if "Pinecone" is missing (it's in the JD but not the resume)
    is_pinecone_missing = any("Pinecone" in s for s in result.get('missing_skills')) or any("Vector Databases" in s for s in result.get('missing_skills'))
    if is_pinecone_missing:
         print("✅ SUCCESS: Missing JD skill (Pinecone) correctly identified.")
    else:
         print("❌ FAILURE: Missing skill was marked as matched or ignored.")

    # 3. Check for Python-to-LLM score clamping
    stats = result.get('python_match_stats', {})
    print(f"📊 Python Base Score: {stats.get('base_score')}%")
    print(f"🎯 Final Clamped Score: {result.get('match_score')}%")
    
    print("-" * 50)
    print("Test Complete.")

if __name__ == "__main__":
    asyncio.run(run_test())
