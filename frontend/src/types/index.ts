export interface Resume {
  id: string;
  filename: string;
  raw_text: string;
  skills: string[];
  experience: ExperienceItem[];
  education: EducationItem[];
  projects: ProjectItem[];
  summary: string | null;
  created_at: string;
}

export interface ExperienceItem {
  company: string;
  title: string;
  duration: string;
  bullets: string[];
}

export interface EducationItem {
  institution: string;
  degree: string;
  field: string;
  year: string;
}

export interface ProjectItem {
  name: string;
  description: string;
  technologies: string[];
  bullets?: string[];
}

export interface JobListing {
  job_title: string;
  company: string | null;
  location: string | null;
  job_url: string | null;
  job_description: string;
  salary: string | null;
  posted_date: string | null;
  employment_type: string | null;
}

export interface JobListingResponse {
  jobs: JobListing[];
  source: string;
}

export interface LearningResource {
  title: string;
  url: string;
  type: string;
}

// ── Structured JD returned by AI extraction ──────────────────────────────────
export interface JdRole {
  job_title: string | null;
  company_name: string | null;
  department: string | null;
  location: string | null;
  remote_policy: string | null;
  employment_type: string | null;
  job_summary: string | null;
}
export interface JdTechnical {
  required_skills: string[];
  preferred_skills: string[];
  all_technologies: string[];
  technical_experience_notes: string | null;
}
export interface JdExperience {
  years_min: number | null;
  years_max: number | null;
  seniority_level: string | null;
  domain_experience: string[];
  leadership_required: boolean;
  leadership_description: string | null;
}
export interface JdEducation {
  degree_required: string | null;
  degree_preferred: string | null;
  fields_of_study: string[];
  certifications_required: string[];
  certifications_preferred: string[];
}
export interface JdCulture {
  soft_skills: string[];
  culture_signals: string | null;
  work_style: string | null;
  team_context: string | null;
}
export interface JdEligibility {
  visa_sponsorship: boolean | null;
  visa_sponsorship_note: string | null;
  work_authorization_required: string | null;
  security_clearance_required: string | null;
  citizenship_required: boolean | null;
  citizenship_note: string | null;
}
export interface JdCompensation {
  salary_range: string | null;
  equity_mentioned: boolean;
  benefits_highlights: string[];
}
export interface JdResponsibilities {
  key_responsibilities: string[];
  key_achievements_expected: string[];
}
export interface JdStructured {
  role: JdRole;
  technical: JdTechnical;
  experience: JdExperience;
  education: JdEducation;
  culture: JdCulture;
  eligibility: JdEligibility;
  compensation: JdCompensation;
  responsibilities: JdResponsibilities;
  recruiter_signals?: {
    urgency?: string | null;
    red_flags?: string[];
    important_notes?: string | null;
  };
}

export interface AnalysisResult {
  id: string;
  resume_id: string;
  job_title: string;
  company: string | null;
  job_url: string | null;
  match_score: number;
  match_label?: string;
  matched_skills: string[];
  missing_skills: string[];
  recommended_skills: string[];
  experience_gaps: string[];
  learning_resources: Record<string, LearningResource[]>;
  reasoning?: string;
  semantic_boost?: number;
  status: string;
  priority_group?: string; // High, Worth Pursuit, Normal, Not Worth
  notes?: string;
  created_at: string;
  job_description?: string;
  /** AI-extracted structured JD data — present after analysis */
  jd_structured?: JdStructured;
}

export interface OptimizedResume {
  id: string;
  tracked_job_id: string;
  optimized_text: string;
  original_resume_text: string | null;
  pdf_path: string | null;
  docx_path: string | null;
  created_at: string;
}

export interface CoverLetter {
  id: string;
  tracked_job_id: string;
  content: string;
  created_at: string;
}

export interface DashboardStats {
  total_jobs_analyzed: number;
  average_match_score: number;
  top_missing_skills: string[];
  jobs_applied: number;
}
