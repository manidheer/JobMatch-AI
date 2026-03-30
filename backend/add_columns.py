"""
Script to add missing columns to tracked_jobs table
"""
import asyncio
from sqlalchemy import text
from app.database import engine

async def run_alter():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE tracked_jobs ADD COLUMN strengths JSONB DEFAULT '[]'::jsonb;"))
        except Exception as e: print("strengths:", e)
        try:
            await conn.execute(text("ALTER TABLE tracked_jobs ADD COLUMN quick_wins JSONB DEFAULT '[]'::jsonb;"))
        except Exception as e: print("quick_wins:", e)
        try:
            await conn.execute(text("ALTER TABLE tracked_jobs ADD COLUMN eligibility_flags JSONB DEFAULT '[]'::jsonb;"))
        except Exception as e: print("eligibility_flags:", e)
        try:
            await conn.execute(text("ALTER TABLE tracked_jobs ADD COLUMN match_label VARCHAR(100);"))
        except Exception as e: print("match_label:", e)
        try:
            await conn.execute(text("ALTER TABLE tracked_jobs ADD COLUMN python_match_stats JSONB;"))
        except Exception as e: print("python_match_stats:", e)

    print("ALTER TABLE statements executed.")

if __name__ == "__main__":
    asyncio.run(run_alter())
