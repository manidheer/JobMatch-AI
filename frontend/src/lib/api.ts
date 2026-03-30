import axios, { AxiosError } from 'axios';
import {
  Resume,
  JobListingResponse,
  JobListing,
  AnalysisResult,
  OptimizedResume,
  CoverLetter,
  DashboardStats,
} from '@/types';
import { getStoredToken } from '@/lib/auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 120000,
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// Handle responses
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[API Error] ${err.response?.status ?? 'NETWORK'} — ${err.config?.url}`, err.response?.data);
    }
    // On 401, clear token and redirect to login (skip if already on auth pages)
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname;
      const isAuthPage = path.startsWith('/login') || path.startsWith('/register');
      if (!isAuthPage) {
        localStorage.removeItem('jma_token');
        localStorage.removeItem('jma_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

/**
 * Extract a human-readable error message from any thrown error.
 * Handles FastAPI's `{"detail": "..."}` shape, plain strings, and network errors.
 */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (!err) return fallback;
  const axiosErr = err as AxiosError<{ detail?: string | { msg: string }[] }>;
  if (axiosErr.response?.data) {
    const detail = axiosErr.response.data.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((d) => d.msg).join('; ');
  }
  if (axiosErr.code === 'ECONNABORTED') return 'Request timed out. The AI is taking longer than expected — please try again.';
  if (!axiosErr.response) return 'Cannot reach the server. Please check your connection.';
  const status = axiosErr.response?.status;
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status === 500) return 'Server error. Please try again in a moment.';
  if (status === 503) return 'Service temporarily unavailable. Please try again shortly.';
  if (err instanceof Error) return err.message;
  return fallback;
}

/** Retry helper: retries once on network/timeout errors for critical calls. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const isNetwork = !err.response; // no response = network / timeout
    if (isNetwork) {
      await new Promise((r) => setTimeout(r, 800));
      return fn();
    }
    throw err;
  }
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<{ status: string; db: string }> {
  const { data } = await api.get<{ status: string; db: string }>('/api/health', {
    timeout: 5000,
  });
  return data;
}

// ─── Resume ───────────────────────────────────────────────────────────────────

export async function uploadResume(file: File): Promise<Resume> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<Resume>('/api/resume/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function uploadResumeText(text: string): Promise<Resume> {
  const { data } = await api.post<Resume>('/api/resume/text', { text });
  return data;
}

export async function getCurrentResume(): Promise<Resume> {
  const { data } = await api.get<Resume>('/api/resume/current');
  return data;
}

export async function getResume(resumeId: string): Promise<Resume> {
  const { data } = await api.get<Resume>(`/api/resume/${resumeId}`);
  return data;
}

export async function updateResume(
  resumeId: string,
  updateData: {
    skills?: string[];
    experience?: any[];
    education?: any[];
    projects?: any[];
    summary?: string;
  }
): Promise<Resume> {
  const { data } = await api.put<Resume>(`/api/resume/${resumeId}`, updateData);
  return data;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function searchJobs(
  title: string,
  location?: string,
  employmentType: string = 'FULLTIME',
  numResults?: number
): Promise<JobListingResponse> {
  const { data } = await api.post<JobListingResponse>('/api/jobs/search', {
    title,
    location: location || 'United States',
    employment_type: employmentType,
    num_results: numResults || 8,
  });
  return data;
}

export async function scrapeJobUrl(url: string): Promise<JobListing> {
  const { data } = await api.post<JobListing>('/api/jobs/scrape', { url });
  return data;
}

export async function submitManualJob(job: {
  job_title: string;
  company?: string;
  job_url?: string;
  job_description: string;
}): Promise<JobListing> {
  const { data } = await api.post<JobListing>('/api/jobs/manual', job);
  return data;
}

export async function extractJobDetails(job: {
  job_title: string;
  company?: string;
  job_url?: string;
  job_description: string;
}): Promise<any> {
  const { data } = await api.post<any>('/api/jobs/extract', job);
  return data;
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

export async function analyzeJob(params: {
  resume_id: string;
  job_title: string;
  company?: string;
  job_url?: string;
  job_description: string;
  mode?: 'quick' | 'deep';
  persist?: boolean;
  jd_structured?: any;
}): Promise<AnalysisResult | any> {
  return withRetry(() =>
    api.post<AnalysisResult | any>('/api/analysis/analyze', params).then((r) => r.data)
  );
}

export async function trackAnyJob(resume_id: string, analysis: any, status: string = 'analyzed'): Promise<AnalysisResult> {
  const { data } = await api.post<AnalysisResult>('/api/analysis/track-any', { resume_id, analysis, status });
  return data;
}

export async function trackManualJob(params: {
  resume_id: string;
  job_title: string;
  company?: string;
  job_url?: string;
  status?: string;
  priority_group?: string;
  notes?: string;
}): Promise<AnalysisResult> {
  const { data } = await api.post<AnalysisResult>('/api/analysis/track-manual', params);
  return data;
}

export async function getTrackedJobs(resumeId?: string): Promise<AnalysisResult[]> {
  const { data } = await api.get<AnalysisResult[]>('/api/analysis/tracked', {
    params: resumeId ? { resume_id: resumeId } : {},
  });
  return data;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data } = await api.get<DashboardStats>('/api/analysis/stats');
  return data;
}

export async function updateTrackedJob(jobId: string, updates: { 
  status?: string; 
  priority_group?: string; 
  notes?: string;
  job_title?: string;
  company?: string | null;
  job_url?: string | null;
  jd_structured?: any;
}): Promise<AnalysisResult> {
  const { data } = await api.patch<AnalysisResult>(`/api/analysis/${jobId}`, updates);
  return data;
}

export async function deleteTrackedJob(jobId: string): Promise<void> {
  await api.delete(`/api/analysis/${jobId}`);
}

export async function clearAnalyzedJobs(): Promise<void> {
  await api.delete('/api/analysis/clear-analyzed');
}

export async function getAnalysis(jobId: string): Promise<AnalysisResult> {
  const { data } = await api.get<AnalysisResult>(`/api/analysis/${jobId}`);
  return data;
}

// ─── Optimization ──────────────────────────────────────────────────────────────

export async function optimizeResume(
  resumeId: string,
  trackedJobId: string,
  templateType: string = 'mani'
): Promise<OptimizedResume> {
  const { data } = await api.post<OptimizedResume>('/api/optimize/resume', {
    resume_id: resumeId,
    tracked_job_id: trackedJobId,
    template_type: templateType,
  });
  return data;
}

export async function updateOptimizedResume(
  id: string,
  optimizedText: string,
  templateType: string = 'mani'
): Promise<OptimizedResume> {
  const { data } = await api.put<OptimizedResume>(`/api/optimize/resume/${id}`, {
    optimized_text: optimizedText,
    template_type: templateType,
  });
  return data;
}

/** Download a file via authenticated axios and trigger browser save-as dialog. */
async function downloadBlob(url: string, filename: string): Promise<void> {
  const response = await api.get(url, { responseType: 'blob' });
  const blob = new Blob([response.data], { type: response.headers['content-type'] });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export async function getOptimizedResumeForJob(jobId: string): Promise<OptimizedResume | null> {
  try {
    const { data } = await api.get<OptimizedResume>(`/api/optimize/for-job/${jobId}`);
    return data;
  } catch {
    return null;
  }
}

export async function getOptimizedResumeStatus(optimizedResumeId: string): Promise<OptimizedResume> {
  const { data } = await api.get<OptimizedResume>(`/api/optimize/resume/${optimizedResumeId}`);
  return data;
}

export async function downloadOptimizedDocx(optimizedResumeId: string): Promise<void> {
  await downloadBlob(`/api/optimize/${optimizedResumeId}/docx`, 'optimized_resume.docx');
}

export async function downloadOptimizedPdf(optimizedResumeId: string): Promise<void> {
  await downloadBlob(`/api/optimize/${optimizedResumeId}/pdf`, 'optimized_resume.pdf');
}

export async function generateCoverLetter(
  resumeId: string,
  trackedJobId: string
): Promise<CoverLetter> {
  const { data } = await api.post<CoverLetter>('/api/optimize/cover-letter', {
    resume_id: resumeId,
    tracked_job_id: trackedJobId,
  });
  return data;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
  ai_calls_today: number;
  is_admin?: boolean;
  allowed_templates?: string[];
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/api/auth/register', { email, password });
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/api/auth/login', { email, password });
  return data;
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/api/auth/me');
  return data;
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post('/api/auth/forgot-password', { email });
}

export async function resetPassword(token: string, new_password: string): Promise<void> {
  await api.post('/api/auth/reset-password', { token, new_password });
}
