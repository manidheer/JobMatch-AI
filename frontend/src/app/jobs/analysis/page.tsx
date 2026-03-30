'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getCurrentResume, getResume, analyzeJob, getAnalysis, optimizeResume, generateCoverLetter, trackAnyJob } from '@/lib/api';
import { Resume, AnalysisResult, OptimizedResume, CoverLetter } from '@/types';
import AnalysisResults from '@/components/AnalysisResults';
import JdPanel from '@/components/JdPanel';
import OptimizedResumeView from '@/components/OptimizedResumeView';
import { ArrowLeft, Sparkles, Copy, CheckCheck, X, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { getTransientAnalysis, setTransientAnalysis } from '@/lib/sessionStore';
import { useRequireAuth } from '@/lib/auth';

function AnalysisContent() {
  useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [resume, setResume] = useState<Resume | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  
  // Optimization / CL state
  const optimizedRef = useRef<HTMLDivElement>(null);
  const [optimized, setOptimized] = useState<OptimizedResume | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState('mani');
  const [coverLetter, setCoverLetter] = useState<CoverLetter | null>(null);
  const [isGeneratingCL, setIsGeneratingCL] = useState(false);
  const [showCLModal, setShowCLModal] = useState(false);
  const [copiedCL, setCopiedCL] = useState(false);

  // Scroll to optimized resume when it becomes available
  useEffect(() => {
    if (optimized && optimizedRef.current) {
      setTimeout(() => {
        optimizedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [optimized]);

  useEffect(() => {
    async function load() {
      try {
        const r = await getCurrentResume();
        setResume(r);

        const jobId = searchParams.get('id');
        const sessionJob = sessionStorage.getItem('current_job');
        const savedTransient = getTransientAnalysis();

        if (jobId) {
          // If we have an ID, fetch it from backend
          const existing = await getAnalysis(jobId);
          setAnalysis(existing);
          // Always use the exact resume the analysis was run against for accurate comparison
          if (existing.resume_id) {
            try {
              const specificResume = await getResume(existing.resume_id);
              setResume(specificResume);
            } catch {
              // fall back to getCurrentResume result already set above
            }
          }
        } else if (savedTransient) {
          // Check if we have an in-memory analysis already (persisted during current tab session)
          setAnalysis(savedTransient);
        } else if (sessionJob && r) {
          // If we just navigated from Find Jobs, run analysis
          const job = JSON.parse(sessionJob);
          setIsAnalyzing(true);
          try {
            const res = await analyzeJob({
              resume_id: r.id,
              job_title: job.job_title,
              company: job.company,
              job_url: job.job_url,
              job_description: job.job_description,
              mode: 'deep',
              persist: false
            });
            setAnalysis(res);
            setTransientAnalysis(res); // Store for SPA navigation survival
            
            // Clear the "trigger"
            sessionStorage.removeItem('current_job');
          } catch (e) {
            toast.error("Analysis failed.");
            router.push('/jobs');
          } finally {
            setIsAnalyzing(false);
          }
        } else {
          router.push('/jobs');
        }
      } catch (e) {
        toast.error("Error loading analysis.");
        router.push('/jobs');
      }
    }
    load();
  }, [searchParams, router]);

  const handleTrack = async () => {
    if (!resume || !analysis || analysis.id) return;
    setIsTracking(true);
    try {
      const saved = await trackAnyJob(resume.id, analysis, 'analyzed');
      setAnalysis(saved); // Update with ID
      router.replace(`/jobs/analysis?id=${saved.id}`);
      toast.success('Job added to tracking!');
    } catch {
      toast.error('Failed to save to tracking.');
    } finally {
      setIsTracking(false);
    }
  };

  const handleOptimize = async (templateType: string) => {
    if (!resume || !analysis) return;
    setIsOptimizing(true);
    try {
      setCurrentTemplate(templateType);
      const opt = await optimizeResume(resume.id, analysis.id, templateType);
      setOptimized(opt);
      toast.success('Resume optimized!');
    } catch {
      toast.error('Optimization failed.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerateCL = async () => {
    if (!resume || !analysis) return;
    setIsGeneratingCL(true);
    try {
      const cl = await generateCoverLetter(resume.id, analysis.id);
      setCoverLetter(cl);
      setShowCLModal(true);
    } catch {
      toast.error('Failed to generate cover letter.');
    } finally {
      setIsGeneratingCL(false);
    }
  };

  if (isAnalyzing) {
    return (
      <div className="content-area" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner" style={{ width: '40px', height: '40px', borderTopColor: 'var(--brand-500)', marginBottom: '1.5rem' }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Analyzing Match...</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Comparing your resume with the AI-extracted job details.</p>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="content-area">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button 
            onClick={() => router.push('/jobs')}
            className="btn btn-ghost" 
            style={{ fontSize: '0.875rem', gap: '0.5rem', paddingLeft: 0 }}
          >
            <ArrowLeft size={16} /> Find another job
          </button>
          
          {!analysis.id && (
            <button
              onClick={handleTrack}
              disabled={isTracking}
              className="btn btn-secondary btn-sm"
              style={{ gap: '0.5rem', height: '36px', borderRadius: '20px', padding: '0 1rem', border: '1px solid var(--brand-500)', color: 'var(--brand-400)' }}
            >
              {isTracking ? <div className="spinner" /> : <><Plus size={14} /> Add to Tracking</>}
            </button>
          )}
        </div>
        
        <div style={{ textAlign: 'right' }}>
           <h1 style={{ fontSize: '1.25rem', marginBottom: '0.125rem' }}>{analysis.job_title}</h1>
           <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Analysis Report</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: AI Extracted JD */}
        <div className="card" style={{ position: 'sticky', top: '1.5rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem' }}>🤖</span> AI-Extracted Job Info
          </h3>
          <JdPanel 
            jd={analysis.jd_structured as any} 
            rawDescription={analysis.job_description || (() => {
               try {
                 const sj = sessionStorage.getItem('current_job');
                 return sj ? JSON.parse(sj).job_description : '';
               } catch { return ''; }
            })()}
          />
        </div>

        {/* Right: Analysis Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <AnalysisResults
            result={analysis}
            onOptimize={handleOptimize}
            onCoverLetter={handleGenerateCL}
            isOptimizing={isOptimizing}
            isGeneratingCL={isGeneratingCL}
          />

          {optimized && (
            <div ref={optimizedRef} className="card">
              <OptimizedResumeView
                optimized={optimized}
                resume={resume}
                templateType={currentTemplate}
                onUpdate={setOptimized}
              />
            </div>
          )}
        </div>
      </div>

      {/* CL Modal */}
      {showCLModal && coverLetter && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1.5rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '680px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
               <h2 style={{ margin: 0, fontSize: '1.125rem' }}>✉️ Cover Letter</h2>
               <div style={{ display: 'flex', gap: '0.5rem' }}>
                 <button onClick={() => { navigator.clipboard.writeText(coverLetter.content); setCopiedCL(true); toast.success('Copied!'); setTimeout(()=>setCopiedCL(false),2000); }} className="btn btn-secondary btn-sm">
                   {copiedCL ? <CheckCheck size={14} /> : <Copy size={14} />} {copiedCL ? 'Copied' : 'Copy'}
                 </button>
                 <button onClick={() => setShowCLModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
               </div>
             </div>
             <div style={{ overflowY: 'auto', flex: 1, background: 'var(--bg-elevated)', borderRadius: '8px', padding: '1.25rem', fontSize: '0.875rem', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif' }}>
               {coverLetter.content}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AnalysisContent />
    </Suspense>
  );
}
