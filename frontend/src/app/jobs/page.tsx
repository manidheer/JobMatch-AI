'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { getCurrentResume, searchJobs, scrapeJobUrl, submitManualJob, extractJobDetails, trackAnyJob, analyzeJob, optimizeResume, generateCoverLetter } from '@/lib/api';
import { Resume, JobListing, AnalysisResult, OptimizedResume, CoverLetter } from '@/types';
import JobCard from '@/components/JobCard';
import JdPanel from '@/components/JdPanel';
import AnalysisResults from '@/components/AnalysisResults';
import OptimizedResumeView from '@/components/OptimizedResumeView';
import { Search, Link2, FileText, ChevronRight, AlertCircle, Sparkles, Binary, Zap, Plus, ArrowLeft, X, Copy, CheckCheck, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { setJobSearchState, getJobSearchState, getTransientAnalysis, setTransientAnalysis } from '@/lib/sessionStore';
import StatusPrioritySelector from '@/components/StatusPrioritySelector';
import { useRequireAuth } from '@/lib/auth';

type InputMode = 'search' | 'url' | 'manual';
type Step = 'input' | 'select' | 'extracted' | 'analyzed';

export default function JobsPage() {
  useRequireAuth();
  const router = useRouter();
  const [resume, setResume] = useState<Resume | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>('search');
  const [step, setStep] = useState<Step>('input');

  // Form state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  const [employmentType, setEmploymentType] = useState('FULLTIME');
  const [pasteUrl, setPasteUrl] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualCompany, setManualCompany] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [manualDesc, setManualDesc] = useState('');

  // Results state
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [extractedJd, setExtractedJd] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);

  // Loading state
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [extractingJd, setExtractingJd] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTracking, setIsTracking] = useState(false);

  // Optimization / CL state (New)
  const optimizedRef = useRef<HTMLDivElement>(null);
  const [optimized, setOptimized] = useState<OptimizedResume | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState('mani');
  const [coverLetter, setCoverLetter] = useState<CoverLetter | null>(null);
  const [isGeneratingCL, setIsGeneratingCL] = useState(false);
  const [showCLModal, setShowCLModal] = useState(false);
  const [copiedCL, setCopiedCL] = useState(false);
  
  // Metadata & System State
  const [status, setStatus] = useState('analyzed');
  const [priority, setPriority] = useState('normal');
  const [showTrackPopover, setShowTrackPopover] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [checkingResume, setCheckingResume] = useState(true);

  const popoverRef = useRef<HTMLDivElement>(null);
  const scoreInfoRef = useRef<HTMLDivElement>(null);
  const [showScoreInfo, setShowScoreInfo] = useState(false);
  const [scoreInfoAnchor, setScoreInfoAnchor] = useState({ top: 0, left: 0 });

  const handleScoreInfoEnter = () => {
    if (scoreInfoRef.current) {
      const rect = scoreInfoRef.current.getBoundingClientRect();
      setScoreInfoAnchor({ top: rect.bottom + 12, left: rect.left + rect.width / 2 });
    }
    setShowScoreInfo(true);
  };

  // Scroll to optimized resume when it becomes available
  useEffect(() => {
    if (optimized && optimizedRef.current) {
      setTimeout(() => {
        optimizedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100); // brief delay lets the DOM paint first
    }
  }, [optimized]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowTrackPopover(false);
      }
    }
    if (showTrackPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTrackPopover]);

  useEffect(() => {
    async function init() {
      try {
        const r = await getCurrentResume();
        setResume(r);
      } catch (e) {} finally {
        setCheckingResume(false);
      }

      const parsed = getJobSearchState();
      const savedTransientAnalysis = getTransientAnalysis();

      if (parsed) {
        if (parsed.searchQuery) setSearchQuery(parsed.searchQuery);
        if (parsed.searchLocation) setSearchLocation(parsed.searchLocation);
        if (parsed.pasteUrl) setPasteUrl(parsed.pasteUrl);
        if (parsed.manualTitle) setManualTitle(parsed.manualTitle);
        if (parsed.manualCompany) setManualCompany(parsed.manualCompany);
        if (parsed.manualUrl) setManualUrl(parsed.manualUrl);
        if (parsed.manualDesc) setManualDesc(parsed.manualDesc);
        if (parsed.jobs) setJobs(parsed.jobs);
        if (parsed.selectedJob) setSelectedJob(parsed.selectedJob);
        if (parsed.extractedJd) setExtractedJd(parsed.extractedJd);
        if (parsed.step) setStep(parsed.step);
        if (parsed.inputMode) setInputMode(parsed.inputMode);
        if (parsed.analysis) setAnalysis(parsed.analysis);
      }
      
      if (savedTransientAnalysis) {
        setAnalysis(savedTransientAnalysis);
      }
      
      setRestoring(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (restoring) return;
    setJobSearchState({
      searchQuery, searchLocation, pasteUrl, manualTitle, manualCompany, manualUrl, manualDesc, jobs, selectedJob, extractedJd, step, inputMode, analysis
    });
  }, [searchQuery, searchLocation, pasteUrl, manualTitle, manualCompany, manualUrl, manualDesc, jobs, selectedJob, extractedJd, step, inputMode, analysis, restoring]);

  // ── Step 1: Search / URL / Manual ──────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) return toast.error('Enter a job title to search.');
    setLoadingJobs(true);
    const oldQuery = searchQuery;
    const oldLoc = searchLocation;
    try {
      setJobs([]);
      setSelectedJob(null);
      setExtractedJd(null);
      const res = await searchJobs(searchQuery, searchLocation, employmentType, 8);
      setJobs(res.jobs);
      setStep('select');
      
      // Success: clear fields for next time
      setSearchQuery('');
      setSearchLocation('');
    } catch {
      toast.error('Search failed. Please try again.');
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleScrapeUrl = async () => {
    if (!pasteUrl.trim()) return toast.error('Enter a job URL.');
    setLoadingJobs(true);
    const urlToScrape = pasteUrl;
    try {
      const job = await scrapeJobUrl(urlToScrape);
      setSelectedJob(job);
      setExtractedJd(null);
      setStep('select');
      
      // Success: clear field
      setPasteUrl('');
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '';
      if (detail.includes('Could not extract')) {
        toast.error('The site blocked our automatic reader. Redirecting to manual paste.');
        setInputMode('manual');
        setManualUrl(urlToScrape);
        setPasteUrl(''); // Clear the URL field even on fallback to manual
      } else {
        toast.error(detail || 'Failed to fetch job listing.');
      }
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualTitle.trim() || !manualDesc.trim()) {
      return toast.error('Job title and description are required.');
    }
    const job = await submitManualJob({
      job_title: manualTitle,
      company: manualCompany || undefined,
      job_url: manualUrl || undefined,
      job_description: manualDesc,
    });
    setSelectedJob(job);
    setExtractedJd(null);
    setStep('select');
    
    // Clear manual fields
    setManualTitle('');
    setManualCompany('');
    setManualUrl('');
    setManualDesc('');
  };

  const handleExtractJd = async () => {
    if (!selectedJob) return;
    setExtractingJd(true);
    try {
      const result = await extractJobDetails({
        job_title: selectedJob.job_title,
        company: selectedJob.company || '',
        job_url: selectedJob.job_url || '',
        job_description: selectedJob.job_description,
      });
      setExtractedJd(result);
      setStep('extracted');
    } catch (e) {
      toast.error('AI Extraction failed.');
    } finally {
      setExtractingJd(false);
    }
  };

  const handleTrackJob = async () => {
    if (!resume || !selectedJob) return;
    setIsTracking(true);
    try {
      let analysisToSave;
      if (step === 'analyzed' && analysis) {
        analysisToSave = {
          ...analysis,
          status: status,
          priority_group: priority,
        };
      } else {
        analysisToSave = {
          job_title: selectedJob.job_title,
          company: selectedJob.company,
          job_url: selectedJob.job_url,
          job_description: selectedJob.job_description,
          jd_structured: extractedJd || null,
          status: status,
          priority_group: priority,
          match_score: 0,
          matched_skills: [],
          missing_skills: [],
          recommended_skills: [],
          experience_gaps: [],
        };
      }

      const saved = await trackAnyJob(resume.id, analysisToSave, status);
      if (step === 'analyzed') {
        setAnalysis(saved);
        setTransientAnalysis(saved);
      }
      setShowTrackPopover(false);
      toast.success('Job added to tracking!');
    } catch {
      toast.error('Failed to add to tracking.');
    } finally {
      setIsTracking(false);
    }
  };

  const handleStartAnalysis = async () => {
    if (!resume) return toast.error('Upload your resume first.');
    if (!selectedJob) return;

    setIsAnalyzing(true);
    try {
      const res = await analyzeJob({
        resume_id: resume.id,
        job_title: selectedJob.job_title,
        company: selectedJob.company || '',
        job_url: selectedJob.job_url || '',
        job_description: selectedJob.job_description,
        mode: 'deep',
        persist: false,
        jd_structured: extractedJd || undefined
      });
      setAnalysis(res);
      setTransientAnalysis(res);
      setStep('analyzed'); // Only switch view AFTER data is ready
    } catch (e) {
      toast.error("Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleOptimize = async (templateType: string) => {
    if (!resume || !analysis || !analysis.id) return;
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
    if (!resume || !analysis || !analysis.id) return;
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

  const resetSearch = () => {
    setJobs([]);
    setSelectedJob(null);
    setExtractedJd(null);
    setAnalysis(null);
    setTransientAnalysis(null);
    setStep('input');
    setOptimized(null);
    setCoverLetter(null);
    setStatus('analyzed');
    setPriority('normal');
    setShowTrackPopover(false);
  };

  const modeButtons: { mode: InputMode; icon: any; label: string }[] = [
    { mode: 'search', icon: Search, label: 'Search' },
    { mode: 'url', icon: Link2, label: 'URL' },
    { mode: 'manual', icon: FileText, label: 'Manual' },
  ];

  const showSidebar = step === 'input' || step === 'select';

  return (
    <div className="content-area">
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.875rem', marginBottom: '0.375rem' }}>Explore & Match Jobs</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
          Find your next role and understand exactly what they are looking for.
        </p>
      </div>

      {!resume && !checkingResume && (
        <div className="card" style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.3)', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <AlertCircle size={18} style={{ color: 'var(--accent-orange)', flexShrink: 0 }} />
          <div>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--accent-orange)' }}>Resume required</span>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
              Please <a href="/resume" style={{ color: 'var(--brand-400)', fontWeight: 500 }}>upload your resume</a> before analyzing matches.
            </span>
          </div>
        </div>
      )}

      {/* Step 2: Main Layout */}
      {/* Analyzing overlay — shown while AI is processing */}
      {isAnalyzing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(12px)', zIndex: 9000,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '2rem',
        }}>
          <div style={{
            width: '72px', height: '72px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            borderRadius: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem',
            animation: 'pulse-glow 1.5s ease-in-out infinite',
            boxShadow: '0 0 50px rgba(59,130,246,0.4)',
          }}>🎯</div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
              Analyzing Your Match <div className="spinner" style={{ width: '18px', height: '18px', borderWidth: '3px', borderTopColor: '#fff', borderRightColor: 'transparent' }} />
            </h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '340px', lineHeight: 1.6 }}>
              {extractedJd ? 'Running accelerated AI pipeline: bypassing extraction → hybrid skill matching → holistic LLM analysis…' : 'Running 3-step AI pipeline: extracting JD → hybrid skill matching → holistic LLM analysis…'}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', width: '300px' }}>
            {[
              extractedJd ? 'Using pre-extracted Job Description' : 'Parsing job description', 
              'Matching skills against resume', 
              'Generating holistic insights'
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 1rem', background: 'rgba(59,130,246,0.08)', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.15)' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(59,130,246,0.2)', border: '2px solid rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div className="spinner" style={{ width: '10px', height: '10px', borderWidth: '2px', borderTopColor: 'var(--brand-400)', borderRightColor: 'transparent', animationDuration: '0.8s' }} />
                </div>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'analyzed' && analysis ? (
        <div className="animate-fadeUp" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Professional Full-Width Glass Header */}
          <div style={{ 
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
            marginBottom: '0.5rem', padding: '0.875rem 1.5rem', 
            background: 'rgba(30,30,35,0.4)', backdropFilter: 'blur(16px)',
            borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 32px -4px rgba(0,0,0,0.3)',
            position: 'sticky', top: '0', zIndex: 10
          }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button 
                onClick={() => setStep('select')}
                className="btn btn-ghost" 
                style={{ fontSize: '0.8125rem', height: '36px', gap: '0.375rem', padding: '0 0.875rem', borderRadius: '12px' }}
              >
                <ArrowLeft size={16} /> Back
              </button>
              <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.1)' }} />
              <button 
                onClick={resetSearch}
                className="btn btn-ghost"
                style={{ fontSize: '0.8125rem', height: '36px', gap: '0.375rem', color: 'var(--brand-400)', padding: '0 0.875rem', borderRadius: '12px' }}
              >
                <Search size={14} /> Analyze New Job
              </button>
            </div>
            
            <div style={{ flex: 1, textAlign: 'center', minWidth: 0, padding: '0 1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.125rem' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>AI Analysis Report</h1>
                <div
                  ref={scoreInfoRef}
                  onMouseEnter={handleScoreInfoEnter}
                  onMouseLeave={() => setShowScoreInfo(false)}
                  style={{ cursor: 'help', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 800 }}>i</span>
                </div>
                {showScoreInfo && createPortal(
                  <div
                    onMouseEnter={() => setShowScoreInfo(true)}
                    onMouseLeave={() => setShowScoreInfo(false)}
                    style={{
                      position: 'fixed',
                      top: `${scoreInfoAnchor.top}px`,
                      left: `${scoreInfoAnchor.left}px`,
                      transform: 'translateX(-50%)',
                      zIndex: 99999,
                      width: '520px',
                      maxWidth: 'calc(100vw - 40px)',
                      padding: '1.75rem',
                      textAlign: 'left',
                      fontWeight: 400,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.75,
                      background: 'var(--bg-elevated)',
                      border: '1px solid rgba(96,165,250,0.3)',
                      borderRadius: '16px',
                      boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
                      pointerEvents: 'auto',
                    }}
                  >
                    <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '1rem', fontSize: '0.9375rem' }}>How your score is calculated</strong>
                    <div style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>
                      <strong style={{ color: 'var(--brand-400)' }}>1. Exact Match (Python Engine)</strong><br/>
                      We perform a fast, deterministic scan of your resume against the JD. Required skills make up 70% of the base score, Preferred skills 30%.
                    </div>
                    <div style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>
                      <strong style={{ color: 'var(--accent-purple)' }}>2. Semantic Context (AI Engine)</strong><br/>
                      Our LLM acts as an expert recruiter to evaluate context, seniority, and missing aliases, adjusting your final score up or down by a maximum of &plusmn;10 points to prevent AI hallucination.
                    </div>
                    <div style={{ fontSize: '0.8125rem' }}>
                      <strong style={{ color: 'var(--accent-green)' }}>3. Ongoing Tracking</strong><br/>
                      All insights are generated live. Save the job to your tracker to unlock Resume Optimization.
                    </div>
                  </div>,
                  document.body
                )}
              </div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>Comprehensive Alignment Evaluation</div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', width: '220px', justifyContent: 'flex-end' }}>
               {/* Metadata removed for cleaner look */}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem', alignItems: 'start', height: 'calc(100vh - 160px)' }}>
            {/* Left Col: Extractions + Lead Tools */}
            <div style={{ height: '100%', overflowY: 'auto', paddingRight: '0.5rem' }}>
              <div className="card" style={{ marginBottom: '1rem', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <span style={{ fontSize: '1rem' }}>🤖</span> AI Job Extraction
                  </h3>
                  
                  {!analysis.id && (
                    <div style={{ position: 'relative' }} ref={popoverRef}>
                      <button
                        onClick={() => setShowTrackPopover(!showTrackPopover)}
                        className="btn btn-primary btn-sm"
                        style={{ gap: '0.5rem', height: '32px', borderRadius: '10px', fontSize: '0.75rem', background: 'var(--gradient-brand)' }}
                      >
                        <Plus size={12} /> Track Job
                      </button>
                      
                      {showTrackPopover && (
                        <div className="card animate-fadeDown" style={{ 
                          position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 1000, 
                          width: '300px', background: 'var(--bg-surface)', border: '1px solid var(--bg-border)',
                          padding: '1.25rem', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)'
                        }}>
                          <div style={{ marginBottom: '1.25rem' }}>
                            <h4 style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-muted)' }}>TRACKING PRESETS</h4>
                            <StatusPrioritySelector 
                              status={status} setStatus={setStatus} 
                              priority={priority} setPriority={setPriority} 
                              variant="full"
                            />
                          </div>
                          <button 
                            className="btn btn-primary" 
                            style={{ width: '100%', height: '38px', fontSize: '0.8125rem' }}
                            onClick={handleTrackJob}
                            disabled={isTracking}
                          >
                            {isTracking ? <div className="spinner" /> : 'Confirm & Track'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <JdPanel 
                  jd={analysis.jd_structured || extractedJd} 
                  rawDescription={selectedJob?.job_description || analysis.job_description} 
                />
              </div>
            </div>

            {/* Right Col: Match Intelligence */}
            <div style={{ height: '100%', overflowY: 'auto', paddingRight: '0.5rem' }}>
              <AnalysisResults
                result={analysis}
                onOptimize={handleOptimize}
                onCoverLetter={handleGenerateCL}
                isOptimizing={isOptimizing}
                isGeneratingCL={isGeneratingCL}
              />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: showSidebar ? '400px 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Left Column (Search / Navigation) */}
          {showSidebar ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="card">
                <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.25rem' }}>
                  {modeButtons.map(({ mode, icon: Icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => { setInputMode(mode); setJobs([]); setStep('input'); setSelectedJob(null); setExtractedJd(null); }}
                      className={`btn btn-sm ${inputMode === mode ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ flex: 1, height: '40px', fontSize: '0.8125rem' }}
                    >
                      <Icon size={14} /> {label}
                    </button>
                  ))}
                </div>

                {inputMode === 'search' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <input className="input" placeholder="Job title, e.g. Senior Backend Engineer" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                    <input className="input" placeholder="Location (optional)" value={searchLocation} onChange={e => setSearchLocation(e.target.value)} />
                    <select className="input" value={employmentType} onChange={e => setEmploymentType(e.target.value)}>
                      <option value="FULLTIME">Full-time</option>
                      <option value="CONTRACT">Contract</option>
                      <option value="PARTTIME">Part-time</option>
                      <option value="INTERN">Internship</option>
                    </select>
                    <button className="btn btn-primary" onClick={handleSearch} disabled={loadingJobs} style={{ height: '46px' }}>
                      {loadingJobs ? <div className="spinner" style={{ borderTopColor: '#fff' }} /> : <><Search size={16} /> Search Opportunities</>}
                    </button>
                  </div>
                )}

                {inputMode === 'url' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <input className="input" placeholder="https://linkedin.com/jobs/view/..." value={pasteUrl} onChange={e => setPasteUrl(e.target.value)} />
                    <button className="btn btn-primary" onClick={handleScrapeUrl} disabled={loadingJobs} style={{ height: '46px' }}>
                      {loadingJobs ? <div className="spinner" style={{ borderTopColor: '#fff' }} /> : <><Link2 size={16} /> Fetch Listing</>}
                    </button>
                  </div>
                )}

                {inputMode === 'manual' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <input className="input" placeholder="Job Title *" value={manualTitle} onChange={e => setManualTitle(e.target.value)} />
                    <input className="input" placeholder="Company (optional)" value={manualCompany} onChange={e => setManualCompany(e.target.value)} />
                    <textarea className="input" placeholder="Paste job description here… *" value={manualDesc} onChange={e => setManualDesc(e.target.value)} style={{ minHeight: '130px' }} />
                    <button className="btn btn-primary" onClick={handleManualSubmit} style={{ height: '46px' }}>
                       Use This Job
                    </button>
                  </div>
                )}
              </div>

              {jobs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{jobs.length} roles found</p>
                  {jobs.map((j, i) => (
                    <JobCard key={i} job={j} selected={selectedJob === j} onClick={() => { setSelectedJob(j); setExtractedJd(null); setStep('select'); }} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ position: 'sticky', top: '1.5rem' }}>
               <button onClick={resetSearch} className="btn btn-ghost" style={{ gap: '0.5rem', paddingLeft: 0, color: 'var(--brand-400)' }}>
                 <ArrowLeft size={18} /> Search New Job
               </button>
            </div>
          )}

          {/* Right Column (Selection View) */}
          {selectedJob && (
            <div className="animate-fadeUp" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="card" style={{ borderLeft: '4px solid var(--brand-500)', padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{selectedJob.job_title}</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>{selectedJob.company || 'Unknown Company'}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {extractedJd ? (
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <div style={{ position: 'relative' }} ref={popoverRef}>
                          <button 
                            onClick={() => setShowTrackPopover(!showTrackPopover)} 
                            disabled={isTracking}
                            className="btn btn-secondary" 
                            style={{ height: '48px', padding: '0 1.25rem' }}
                          >
                            <Plus size={18} /> Add to Tracking
                          </button>

                          {showTrackPopover && (
                            <div className="card animate-fadeDown" style={{ 
                              position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 1000, 
                              width: '320px', background: 'var(--bg-surface)', border: '1px solid var(--bg-border)',
                              padding: '1.25rem', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)'
                            }}>
                              <div style={{ marginBottom: '1.25rem' }}>
                                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-muted)' }}>TRACKING PRESETS</h4>
                                <StatusPrioritySelector 
                                  status={status} setStatus={setStatus} 
                                  priority={priority} setPriority={setPriority} 
                                  variant="full"
                                />
                              </div>
                              <button 
                                className="btn btn-primary" 
                                style={{ width: '100%', height: '42px' }}
                                onClick={handleTrackJob}
                                disabled={isTracking}
                              >
                                {isTracking ? <div className="spinner" /> : 'Confirm & Track Job'}
                              </button>
                            </div>
                          )}
                        </div>

                        <button onClick={handleStartAnalysis} disabled={isAnalyzing} className="btn btn-primary btn-lg" style={{ height: '48px', padding: '0.5rem 1.5rem', background: 'var(--gradient-brand)' }}>
                          {isAnalyzing ? <div className="spinner" style={{ borderTopColor: '#fff' }} /> : <><Binary size={18} /> Performance Analysis</>}
                        </button>
                      </div>
                    ) : (
                      <button onClick={handleExtractJd} disabled={extractingJd} className="btn btn-primary btn-lg" style={{ height: '48px', padding: '0 1.5rem', background: 'var(--accent-purple)' }}>
                        {extractingJd ? <div className="spinner" style={{ borderTopColor: '#fff' }} /> : <><Sparkles size={18} /> Supercharge with AI Extraction</>}
                      </button>
                    )}
                  </div>
                </div>

                {step === 'select' && !extractedJd && (
                  <div style={{ borderTop: '1px solid var(--bg-border)', paddingTop: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>
                      <FileText size={16} /> Basic Job Description
                    </div>
                    <div style={{ 
                      maxHeight: '450px', 
                      overflowY: 'auto', 
                      fontSize: '0.875rem', 
                      lineHeight: 1.7, 
                      whiteSpace: 'pre-wrap', 
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-elevated)',
                      padding: '1.25rem',
                      borderRadius: '8px'
                    }}>
                      {selectedJob.job_description}
                    </div>
                  </div>
                )}

                {extractedJd && (
                  <div style={{ borderTop: '1px solid var(--bg-border)', paddingTop: '1.25rem' }}>
                     <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1rem' }}>🤖</span> AI-Extracted Intelligence
                    </h3>
                    <JdPanel jd={extractedJd} rawDescription={selectedJob.job_description} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Optimized Resume Section */}
      {optimized && (
        <div ref={optimizedRef} id="optimized-section" className="animate-fadeUp" style={{ marginTop: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Optimized Resume</h2>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setOptimized(null)} className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-red)' }}>
                 <X size={14} /> Clear
              </button>
            </div>
          </div>
          <OptimizedResumeView optimized={optimized} templateType={currentTemplate} />
        </div>
      )}

      {/* Cover Letter Modal */}
      {showCLModal && coverLetter && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div className="card" style={{ maxWidth: '800px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--bg-border)', paddingBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem' }}>AI Generated Cover Letter</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCLModal(false)}><X size={20} /></button>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--text-primary)', background: 'var(--bg-body)', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
              {coverLetter.content}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(coverLetter.content);
                  setCopiedCL(true);
                  setTimeout(() => setCopiedCL(false), 2000);
                }}
              >
                {copiedCL ? <><CheckCheck size={16} /> Copied</> : <><Copy size={16} /> Copy to Clipboard</>}
              </button>
              <button className="btn btn-primary" onClick={() => setShowCLModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
