# AI Job Match Assistant & Decision Matrix

This application uses large language models (LLMs) and advanced natural language processing to evaluate a candidate's resume against a job description. It provides a deterministic, data-driven analysis of how well a candidate fits a role, highlights critical skill gaps, and recommends actionable steps to improve the application.

---

## 1. Resume Extraction (Basic)

The system first extracts the raw text from an uploaded resume (PDF or DOCX), doing its best to preserve the natural reading order of tables and columns.

**Process:**

1. **Raw Extraction:** Uses `pdfplumber` for PDFs and `python-docx` for Word documents.
2. **AI Parsing:** The raw text is fed into a single LLM prompt (`temperature=0`, `seed=42` for maximum determinism). The AI extracts the candidate's professional summary, contact info, job history, and an exhaustive list of every skill mentioned across the entire document.
3. **Skill Normalisation:** A custom Python script sanitizes the AI's output, breaking down grouped skills (e.g., `"RAG (LangChain, LlamaIndex)"` becomes `["RAG", "LangChain", "LlamaIndex"]`), removing duplicates, and guaranteeing a perfectly flat list of atomic tech skills.

---

## 2. Job Description Extraction (Detailed)

Extracting a structured Job Description (JD) is much harder because the system must perfectly distinguish between hard _technical_ requirements and soft _behavioral_ traits. We use a **Two-Pass AI Pipeline** augmented by a Python safety net.

### Pass 1: Comprehensive AI Extraction

The raw text of the job description (often scraped from LinkedIn or entered manually) is fed to the LLM. The AI is ordered to strictly capture skill names VERBATIM.

- **Requirement Segregation:** It splits skills into `required_skills` (must-haves) and `preferred_skills` (nice-to-haves).
- **The "Hard Boundary" Rule:** The AI is strictly instructed that _Technical/Hard Skills_ (Python, React, AWS, Agile) go into the requirement arrays, but _Soft/Interpersonal Skills_ (communication, teamwork, leadership) must go into a totally separate `culture.soft_skills` array.

### Pass 2: AI Validation & Cleanup

Because LLMs sometimes hallucinate or fail to follow negative constraints (e.g., they accidentally leave "communication" in the required hard skills list), a _second_ LLM acts as a Data Quality Validator.

- It scans the output of Pass 1.
- If it finds any interpersonal traits in the technical arrays, it rips them out and moves them to `culture.soft_skills`.
- It separates prose phrases (e.g., "building scalable cloud-based infrastructure") from atomic skills ("AWS"), moving the prose to a notes section.
- It flags any totally unknown technologies for review (e.g., proprietary internal tools).

### Pass 3: Python Safety Net (`_enforce_soft_skill_boundary`)

As a final, foolproof layer of protection, a custom Python function scans the final technical arrays against a hardcoded blacklist of known soft skills (`"communication"`, `"teamwork"`, `"problem-solving"`, etc.). If the two LLMs both completely missed a soft skill, this script catches it and forcibly exiles it to the culture section.

**Result:** A pristine, perfectly structured JSON representation of the job's true technical requirements, devoid of behavioral fluff.

---

## 3. Analysis & Outputs

Once the Resume and JD are parsed into clean JSON objects, they are passed to the **Skill Matcher** and **AI Analyzer**.

### Step 3a: Skill Matching

We perform a hybrid skill match:

1. **Exact Matching:** Fast, case-insensitive string matching.
2. **Semantic Fallback:** Any JD skills that weren't found are sent to an LLM to check for semantic equivalents (e.g., checking if the candidate's "ReactJS" counts as the JD's "React.js", or if their "GCP" counts as "Google Cloud Platform").

### Step 3b: Scoring & Insights

The application calculates a final score based on a weighted average of two metrics:

1. **Coverage (Base Score):** The mathematical percentage of required JD skills the candidate actually possesses.
2. **Semantic Boost:** A contextual bonus awarded by the AI if the candidate lacks a specific required tool (e.g., PostgreSQL) but has deep, highly transferable experience in a sister tool (e.g., MySQL or Oracle).

### Final Outputs Displayed to the User:

- **Score Ring:**
  - **Overall:** The total calculated match score (out of 100%).
  - **Required:** How many mandatory skills the candidate has vs how many the JD asked for (e.g., `8/10`).
  - **Coverage:** The base percentage of matched requirements.
  - **Semantic:** The bonus percentage awarded by the AI for transferable domain knowledge.
- **Skill Counts (Matched / Missing / Recommended):**
  - Displays exactly which hard skills were found, which were painfully absent, and which tangential skills the candidate should learn to boost their odds.
- **Skill Gaps Matrix:**
  - A side-by-side view showing the exact missing hard skills next to curated, free online learning resources (e.g., links to YouTube or official docs for that specific skill).
- **Strengths & Quick Wins:**
  - **Strengths:** Highlights what the candidate does exceptionally well relative to the role (e.g., "Exceeds seniority requirements by 3 years").
  - **Quick Wins:** Simple tweaks the candidate can make to their resume _today_ to pass an ATS scanner (e.g., "Change 'JS' to 'JavaScript'").
- **Action Plan:**
  - A prioritized, ordered checklist of exactly what the candidate must do to secure an interview, split into immediate resume changes and long-term learning goals.
- **Eligibility Flags:**
  - Red or green flags warning the candidate about Visa Sponsorship limits, security clearance requirements, or remote work mismatches before they waste time applying.

---

## 4. How to Run Locally

You will need three separate processes running concurrently (Database, Backend API, Frontend App).

Use one Python virtual environment at the project root only: `.venv`.
Do not create a second environment in `backend/.venv`.

### 1. Start PostgreSQL Database

Using Docker (recommended):

```bash
docker compose up -d
```

_Alternatively, you can run `./backend/setup_db.sh` if you have local PostgreSQL installed._

Verify the database is actually up before starting the API:

```bash
docker ps
```

If PostgreSQL is not running, the backend will fail at startup with a connection error such as `ConnectionRefusedError: [Errno 61] Connection refused`.

### 2. Run Backend API

Open a new terminal session, activate the root virtual environment, then start the FastAPI server from the `backend` folder:

```bash
cd /path/to/job_match_assistant
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

_(Ensure all Python dependencies from `requirements.txt` are installed in your virtual environment.)_

If you see `zsh: command not found: python` even after activation, your root `.venv` may have been created in a different folder and then moved (stale absolute paths inside `.venv/bin/activate`).

Quick fix (recommended): recreate the virtual environment from the current project path:

```bash
cd /path/to/job_match_assistant
rm -rf .venv backend/.venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

Safe workaround without activation (useful if your shell still has PATH issues):

```bash
cd backend
"../.venv/bin/python" -m uvicorn app.main:app --reload --port 8000
```

### 3. Run Frontend Next.js App

Open another terminal session, navigate to the `frontend` folder, and start the development server:

```bash
cd frontend
npm install  # if running for the first time
npm run dev
```

The application will be accessible at [http://localhost:3000](http://localhost:3000).
