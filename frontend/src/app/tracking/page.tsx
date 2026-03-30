'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getTrackedJobs, deleteTrackedJob, updateTrackedJob, getDashboardStats, getCurrentResume, trackManualJob, clearAnalyzedJobs, trackAnyJob, getOptimizedResumeForJob, downloadOptimizedDocx } from '@/lib/api';
import { AnalysisResult, DashboardStats, JobListing, OptimizedResume } from '@/types';
import {
  Trash2, ExternalLink, TrendingUp, Briefcase, Target, CheckCircle,
  Download, X, MapPin, Zap, Clock, Info, Save, ChevronRight,
  Star, ThumbsDown, Globe, Search, Filter, Plus, Calendar, Pencil,
  BarChart2, FileText, CheckCircle2, XCircle, Lightbulb
} from 'lucide-react';
import toast from 'react-hot-toast';
import JdPanel from '@/components/JdPanel';
import JobDiscoveryModal from '@/components/JobDiscoveryModal';
import { useRequireAuth } from '@/lib/auth';

const STATUS_OPTIONS = ['all', 'analyzed', 'applied', 'interviewing', 'rejected', 'offer'] as const;
const PRIORITY_GROUPS = [
  { id: 'action_needed', label: 'Action Needed', icon: Zap, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { id: 'worth', label: 'Worth Pursuit', icon: Star, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  { id: 'normal', label: 'Backlog', icon: Briefcase, color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
  { id: 'not_worth', label: 'Not Worth', icon: ThumbsDown, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
];

const scoreColor = (s: number) =>
  s >= 75 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ef4444';

export default function TrackingPage() {
  useRequireAuth();
  const [jobs, setJobs] = useState<AnalysisResult[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<AnalysisResult | null>(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editInfo, setEditInfo] = useState({ title: '', company: '', employment_type: '' });
  const [tempNotes, setTempNotes] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'score'>('date');

  // Discovery Modal State
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Report tab + optimized resume
  const [activeTab, setActiveTab] = useState<'intel' | 'report'>('intel');
  const [jobOptimized, setJobOptimized] = useState<OptimizedResume | null>(null);
  const [loadingOptimized, setLoadingOptimized] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);

  // DnD State
  const [activeDropGroup, setActiveDropGroup] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragGhostRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('text', jobId);
    e.dataTransfer.effectAllowed = 'move';
    
    // Set a tiny custom drag image so it doesn't block the sidebar
    if (dragGhostRef.current) {
      e.dataTransfer.setDragImage(dragGhostRef.current, 20, 20);
    }
    
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setActiveDropGroup(null);
  };

  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (activeDropGroup !== groupId) setActiveDropGroup(groupId);
  };

  const handleDrop = async (e: React.DragEvent, newPriority: string) => {
    e.preventDefault();
    setIsDragging(false);
    setActiveDropGroup(null);
    const jobId = e.dataTransfer.getData('text');
    if (!jobId) return;

    // Fast check to see if it's already in this priority
    const job = jobs.find(j => String(j.id) === String(jobId));
    if (job && job.priority_group === newPriority) {
      setIsDragging(false);
      return;
    }

    try {
      await handleUpdate(jobId, { priority_group: newPriority });
      toast.success(`Moved to ${newPriority.replace('_', ' ')}`);
    } catch {
      toast.error('Failed to move job');
    } finally {
      setIsDragging(false);
    }
  };

  const idToString = (id: any) => String(id);

  const loadJobs = async () => {
    try {
      const [j, s] = await Promise.all([getTrackedJobs(), getDashboardStats()]);
      setJobs(j);
      setStats(s);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadJobs(); }, []);

  useEffect(() => {
    if (!activeJob) { setJobOptimized(null); setActiveTab('intel'); return; }
    setLoadingOptimized(true);
    getOptimizedResumeForJob(String(activeJob.id))
      .then(setJobOptimized)
      .finally(() => setLoadingOptimized(false));
  }, [activeJob?.id]);

  const handleDiscoveryAdd = async (job: JobListing, extractedJd?: any, initialStatus: string = 'applied', initialPriority: string = 'normal') => {
    setSubmitting(true);
    try {
      const resume = await getCurrentResume();
      if (!resume) {
        toast.error('Upload your resume first.');
        return;
      }

      const analysisToSave = {
        job_title: job.job_title,
        company: job.company || '',
        job_url: job.job_url || '',
        job_description: job.job_description,
        jd_structured: extractedJd || null,
        status: initialStatus,
        priority_group: initialPriority,
        match_score: 0,
        matched_skills: [],
        missing_skills: [],
        recommended_skills: [],
        experience_gaps: [],
      };

      const saved = await trackAnyJob(resume.id, analysisToSave, initialStatus);
      // Wait, trackAnyJob third param is the status. 
      // But we also have it in analysisToSave.
      
      setJobs(prev => [saved, ...prev]);
      setIsDiscoveryOpen(false);
      toast.success('Job tracked successfully!');
    } catch {
      toast.error('Failed to track job.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Remove this job from tracking?')) return;
    try {
      await deleteTrackedJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
      if (activeJob?.id === id) setActiveJob(null);
      toast.success('Job removed.');
    } catch {
      toast.error('Delete failed.');
    }
  };

  const handleClearAnalyzed = async () => {
    if (!confirm('This will delete all jobs marked as "Analyzed" while keeping your Applied/Rejected jobs. Proceed?')) return;
    try {
      await clearAnalyzedJobs();
      setJobs(prev => prev.filter(j => j.status !== 'analyzed'));
      if (activeJob?.status === 'analyzed') setActiveJob(null);
      toast.success('Analyzed jobs cleared.');
      const s = await getDashboardStats();
      setStats(s);
    } catch {
      toast.error('Failed to clear jobs.');
    }
  };

  const handleUpdate = async (id: string, updates: Parameters<typeof updateTrackedJob>[1]) => {
    try {
      const updated = await updateTrackedJob(id, updates);
      setJobs(prev => {
        const index = prev.findIndex(j => String(j.id) === String(id));
        if (index === -1) return prev;
        const newList = [...prev];
        newList[index] = { ...newList[index], ...updated };
        return newList;
      });
      
      if (String(activeJob?.id) === String(id)) {
        setActiveJob(prev => prev ? { ...prev, ...updated } : null);
      }
      
      if (!updates.notes) toast.success('Updated successfully');
    } catch {
      toast.error('Update failed');
    }
  };

  const handleSaveNotes = async () => {
    if (!activeJob) return;
    setSavingNote(true);
    try {
      await handleUpdate(activeJob.id, { notes: tempNotes });
      setIsEditingNotes(false);
      toast.success('Notes saved');
    } finally {
      setSavingNote(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!activeJob) return;
    try {
      // Deep copy to modify nested jd_structured
      const newJd = JSON.parse(JSON.stringify(activeJob.jd_structured || { role: {} }));
      if (!newJd.role) newJd.role = {};
      newJd.role.employment_type = editInfo.employment_type;

      await handleUpdate(activeJob.id, {
        job_title: editInfo.title,
        company: editInfo.company,
        jd_structured: newJd
      });
      setIsEditingInfo(false);
      toast.success('Job info updated');
    } catch {
      toast.error('Update failed');
    }
  };

  const filteredAndSorted = useMemo(() => {
    let list = [...jobs];
    
    if (statusFilter !== 'all') {
      list = list.filter(j => j.status === statusFilter);
    }

    if (dateFilter) {
      list = list.filter(j => {
        const jobDate = new Date(j.created_at).toISOString().split('T')[0];
        return jobDate === dateFilter;
      });
    }

    if (searchTerm) {
      const lowSearch = searchTerm.toLowerCase();
      list = list.filter(j => {
        const company = j.company || '';
        const aiCompany = (j.jd_structured as any)?.role?.company_name || '';
        return j.job_title.toLowerCase().includes(lowSearch) || 
               company.toLowerCase().includes(lowSearch) ||
               aiCompany.toLowerCase().includes(lowSearch);
      });
    }
    
    // Sort by score if we are filtering, otherwise newest first
    return list.sort((a, b) => {
      if (sortBy === 'score' || dateFilter || statusFilter !== 'all' || searchTerm) {
        const scoreDiff = b.match_score - a.match_score;
        if (scoreDiff !== 0) return scoreDiff;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [jobs, statusFilter, dateFilter, searchTerm, sortBy]);

  const groupedJobs = useMemo(() => {
    const groups: Record<string, AnalysisResult[]> = {
      action_needed: [],
      worth: [],
      normal: [],
      not_worth: [],
    };
    filteredAndSorted.forEach(j => {
      const groupKey = j.priority_group || 'normal';
      if (groups[groupKey]) groups[groupKey].push(j);
      else groups.normal.push(j);
    });
    return groups;
  }, [filteredAndSorted]);

  const getJobDisplayTitle = (job: AnalysisResult) => {
    const structuredTitle = job.jd_structured?.role?.job_title;
    // If original title is too generic or short, prefer high-quality AI extraction
    const genericTerms = ['work', 'job', 'view', 'listing', 'role', 'position'];
    const isGeneric = !job.job_title || genericTerms.includes(job.job_title.toLowerCase()) || job.job_title.length < 3;
    
    return isGeneric ? (structuredTitle || job.job_title || 'Untitled Role') : job.job_title;
  };

  const getJobDisplayCompany = (job: AnalysisResult) => {
    const structuredCompany = job.jd_structured?.role?.company_name;
    const current = job.company;
    
    // Fallback if specific company is missing or a known aggregator placeholder
    const isPlaceholder = !current || 
      ['linkedin', 'indeed', 'glassdoor', 'work', 'null', 'unknown'].includes(current.toLowerCase()) ||
      current.length < 2;

    return isPlaceholder ? (structuredCompany || current || 'Unknown Company') : current;
  };

  return (
    <div className="content-area">
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <TrendingUp size={28} className="text-brand-400" />
            Decision Matrix
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
            Evaluate, categorize, and track your high-performance job matches.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {jobs.some(j => j.status === 'analyzed') && (
            <button 
              className="btn btn-ghost"
              onClick={handleClearAnalyzed}
              style={{ height: '38px', color: 'var(--accent-red)', gap: '0.375rem', fontWeight: 600, fontSize: '0.8125rem', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0 0.75rem', borderRadius: '12px' }}
            >
              <Trash2 size={16} />
              Clear Analyzed
            </button>
          )}

          <div style={{ 
            display: 'flex', gap: '0.5rem', alignItems: 'center', 
            background: 'rgba(30,30,35,0.4)', backdropFilter: 'blur(12px)',
            padding: '4px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 4px 20px -5px rgba(0,0,0,0.3)'
          }}>
            {/* Contextual Search */}
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                className="input" 
                placeholder="Search leads..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '2.5rem', width: '230px', height: '36px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.03)', fontSize: '0.875rem' }}
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.1)' }} />

            {/* Status Channel */}
            <div style={{ position: 'relative' }}>
              <Filter size={13} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <select 
                className="input"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ paddingLeft: '2.25rem', height: '36px', width: '150px', cursor: 'pointer', appearance: 'none', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.03)', fontSize: '0.8125rem' }}
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s === 'all' ? 'Status: Any' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              <div style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)', fontSize: '0.625rem' }}>▼</div>
            </div>

            {/* Date Picker Channel */}
            <div style={{ position: 'relative' }}>
              <Calendar size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input 
                type="date"
                className="input"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                style={{ 
                  paddingLeft: '2.25rem', paddingRight: '2.25rem', height: '36px', width: '175px', cursor: 'pointer',
                  borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.03)', fontSize: '0.8125rem',
                  colorScheme: 'dark'
                }}
              />
              {dateFilter && (
                <button 
                  onClick={() => setDateFilter('')}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', zIndex: 1 }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div style={{ width: '4px' }} />

            <button 
              className="btn btn-primary"
              onClick={() => setIsDiscoveryOpen(true)}
              style={{ height: '36px', gap: '0.375rem', padding: '0 0.875rem', borderRadius: '12px', fontSize: '0.8125rem' }}
            >
              <Plus size={16} />
              Track Job
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton" style={{ height: '160px', borderRadius: '16px' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {PRIORITY_GROUPS.map(group => {
            const groupJobs = groupedJobs[group.id] || [];
            if (groupJobs.length === 0 && (searchTerm || statusFilter !== 'all')) return null;
            
            return (
              <div 
                key={group.id}
                style={{ 
                  padding: '1rem', 
                  borderRadius: '16px', 
                  transition: 'all 0.2s',
                  marginLeft: '-1rem',
                  marginRight: '-1rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: group.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <group.icon size={14} style={{ color: group.color }} />
                  </div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>{group.label}</h2>
                  <span className="badge" style={{ padding: '0.125rem 0.375rem', background: 'var(--bg-border)', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{groupJobs.length}</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--bg-border)' }} />
                </div>

                {groupJobs.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '2rem', borderStyle: 'dashed', background: 'transparent' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Drop jobs here to set priority.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                    {groupJobs.map((job) => {
                      const policy = job.jd_structured?.role?.remote_policy || 'Unknown';
                      const type = job.jd_structured?.role?.employment_type || 'Full-time';
                      const company = getJobDisplayCompany(job);

                      return (
                        <div 
                          key={job.id} 
                          draggable
                          onDragStart={(e) => handleDragStart(e, job.id)}
                          onDragEnd={handleDragEnd}
                          className="card animate-fadeUp" 
                          onClick={() => { setActiveJob(job); setTempNotes(job.notes || ''); setIsEditingNotes(false); }}
                          style={{ 
                            padding: '1rem', 
                            cursor: 'grab', 
                            transition: 'all 0.2s',
                            position: 'relative',
                            overflow: 'hidden',
                            borderLeft: `3px solid ${scoreColor(job.match_score)}`,
                            userSelect: 'none'
                          }}
                          onMouseEnter={(e) => { 
                            e.currentTarget.style.transform = 'translateY(-2px)'; 
                            e.currentTarget.style.boxShadow = '0 8px 20px -5px rgba(0,0,0,0.4)';
                            e.currentTarget.style.borderColor = 'var(--brand-400)'; 
                          }}
                          onMouseLeave={(e) => { 
                            e.currentTarget.style.transform = 'translateY(0)'; 
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.borderColor = 'var(--bg-border)'; 
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '0.125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getJobDisplayTitle(job)}</h3>
                              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{company}</strong>
                                <span style={{ color: 'var(--bg-border)' }}>|</span>
                                <span style={{ color: 'var(--text-muted)' }}>{new Date(job.created_at).toLocaleDateString()}</span>
                              </p>
                            </div>
                            <div style={{ textAlign: 'right', marginLeft: '0.5rem' }}>
                              <div style={{ fontSize: '1.125rem', fontWeight: 800, color: scoreColor(job.match_score), lineHeight: 1 }}>{Math.round(job.match_score)}%</div>
                              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.125rem' }}>Match</div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                            <div className="badge" style={{ padding: '0.125rem 0.5rem', background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', fontSize: '0.6875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Globe size={10} className="text-brand-400" /> {policy}
                            </div>
                            <div className="badge" style={{ padding: '0.125rem 0.5rem', background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', fontSize: '0.6875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Clock size={10} className="text-secondary" /> {type}
                            </div>
                            {job.notes && (
                              <div className="badge" style={{ padding: '0.125rem 0.5rem', background: 'rgba(59,130,246,0.1)', color: 'var(--brand-400)', border: 'none', fontSize: '0.6875rem' }}>
                                <Info size={10} /> Note
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--bg-border)', paddingTop: '0.75rem', marginTop: 'auto' }}>
                            <select 
                              value={job.status} 
                              onClick={e => e.stopPropagation()}
                              onChange={(e) => handleUpdate(job.id, { status: e.target.value })}
                              className="input" 
                              style={{ width: 'auto', height: '28px', fontSize: '0.7rem', padding: '0 0.25rem' }}
                            >
                              {STATUS_OPTIONS.filter(s => s !== 'all').map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                            </select>
                            
                            <div style={{ display: 'flex', gap: '0.125rem', alignItems: 'center' }}>
                              <button 
                                onClick={(e) => handleDelete(e, job.id)} 
                                className="btn btn-ghost btn-sm" 
                                style={{ padding: '0.25rem', color: 'var(--accent-red)', opacity: 0.5 }}
                              >
                                <Trash2 size={12} />
                              </button>
                              <div style={{ padding: '0.25rem', color: 'var(--text-muted)' }}>
                                <ChevronRight size={14} />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Drop Zones for easier drag-and-drop across groups */}
      {/* Hidden Tiny Drag Ghost - used by setDragImage */}
      <div 
        ref={dragGhostRef} 
        style={{ 
          position: 'absolute', top: '-1000px', left: '-1000px',
          width: '50px', height: '50px', borderRadius: '50%',
          background: 'var(--brand-500)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)', zIndex: -100
        }}
      >
        <Briefcase size={20} />
      </div>

      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ scale: 0.8, opacity: 0, x: '-50%', y: '-50%' }}
            animate={{ scale: 1, opacity: 1, x: '-50%', y: '-50%' }}
            exit={{ scale: 0.8, opacity: 0, x: '-50%', y: '-50%' }}
            style={{ 
              position: 'fixed', left: '50%', top: '50%',
              zIndex: 10000, display: 'flex', flexDirection: 'row', gap: '1.25rem',
              background: 'rgba(15, 15, 20, 0.65)', backdropFilter: 'blur(25px)',
              padding: '1.25rem 2rem', borderRadius: '100px', 
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 40px 100px -20px rgba(0, 0, 0, 0.7)',
              pointerEvents: 'auto'
            }}
          >
            {PRIORITY_GROUPS.map(group => {
              const isActive = activeDropGroup === group.id;
              return (
                <div 
                  key={group.id}
                  onDragOver={(e) => handleDragOver(e, group.id)}
                  onDragLeave={() => setActiveDropGroup(null)}
                  onDrop={(e) => handleDrop(e, group.id)}
                  style={{ 
                    width: '72px', height: '72px', borderRadius: '50%',
                    background: isActive ? group.bg : 'var(--bg-elevated)',
                    border: `2px ${isActive ? 'solid' : 'dashed'} ${isActive ? group.color : 'rgba(255,255,255,0.05)'}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s', cursor: 'copy', position: 'relative'
                  }}
                  title={group.label}
                >
                  <group.icon size={24} style={{ color: isActive ? group.color : 'var(--text-muted)', pointerEvents: 'none' }} />
                  <span style={{ fontSize: '0.625rem', marginTop: '0.25rem', color: isActive ? group.color : 'var(--text-muted)', fontWeight: 800, textAlign: 'center', textTransform: 'uppercase', pointerEvents: 'none' }}>
                    {group.id === 'action_needed' ? 'HIGH' : group.id === 'not_worth' ? 'LOW' : group.label.split(' ')[0]}
                  </span>
                  
                  {isActive && (
                    <motion.div 
                      layoutId="drop-glow"
                      style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: `3px solid ${group.color}`, opacity: 0.4, pointerEvents: 'none' }}
                      animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}
                    />
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      {activeJob && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem'
        }}>
          <div className="animate-fadeDown" style={{ 
            width: '100%', maxWidth: '1100px', height: '90vh', background: 'var(--bg-surface)', 
            borderRadius: '24px', position: 'relative', overflow: 'hidden', border: '1px solid var(--bg-border)',
            display: 'flex', flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--bg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--bg-elevated)' }}>
              <div style={{ flex: 1 }}>
                {isEditingInfo ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '600px' }}>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <input 
                        className="input" 
                        value={editInfo.title} 
                        onChange={e => setEditInfo({ ...editInfo, title: e.target.value })} 
                        placeholder="Job Title"
                        style={{ fontSize: '1.25rem', fontWeight: 700, height: '42px' }}
                      />
                      <select
                        className="input"
                        value={editInfo.employment_type}
                        onChange={e => setEditInfo({ ...editInfo, employment_type: e.target.value })}
                        style={{ width: '150px' }}
                      >
                        <option value="Full-time">Full-time</option>
                        <option value="Contract">Contract</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Freelance">Freelance</option>
                        <option value="Internship">Internship</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <input 
                        className="input" 
                        value={editInfo.company} 
                        onChange={e => setEditInfo({ ...editInfo, company: e.target.value })} 
                        placeholder="Company"
                        style={{ height: '36px' }}
                      />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-primary btn-sm" onClick={handleSaveInfo}>Save Changes</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setIsEditingInfo(false)}>Cancel</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                      <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{getJobDisplayTitle(activeJob)}</h2>
                      <span className="badge" style={{ background: scoreColor(activeJob.match_score) + '20', color: scoreColor(activeJob.match_score), fontWeight: 700, fontSize: '0.875rem' }}>
                        {Math.round(activeJob.match_score)}% Match
                      </span>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        style={{ 
                          fontSize: '0.75rem', 
                          height: '32px',
                          gap: '0.375rem',
                          padding: '0 0.875rem',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'var(--text-secondary)'
                        }} 
                        onClick={() => {
                          const title = getJobDisplayTitle(activeJob);
                          const comp = getJobDisplayCompany(activeJob);
                          const type = activeJob.jd_structured?.role?.employment_type || 'Full-time';
                          setEditInfo({ title, company: comp, employment_type: type });
                          setIsEditingInfo(true);
                        }}
                      >
                        <Pencil size={12} />
                        Edit Info
                      </button>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '1.5rem', margin: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Briefcase size={16} /> {getJobDisplayCompany(activeJob)}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                        <Clock size={16} /> {activeJob.jd_structured?.role?.employment_type || 'Full-time'}
                      </span>
                      {activeJob.job_url && (
                        <a href={activeJob.job_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-400)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <ExternalLink size={16} /> Original Listing
                        </a>
                      )}
                    </p>
                  </>
                )}
              </div>
              <button 
                onClick={() => { setActiveJob(null); setIsEditingInfo(false); }} 
                className="btn btn-ghost" 
                style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0 }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--bg-border)', padding: '0 2rem', background: 'var(--bg-elevated)' }}>
              {([['intel', 'Job Intelligence'] as const, ['report', 'Analysis Report'] as const]).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '0.75rem 1rem',
                    fontSize: '0.875rem', fontWeight: activeTab === id ? 700 : 500,
                    color: activeTab === id ? 'var(--brand-400)' : 'var(--text-secondary)',
                    borderBottom: activeTab === id ? '2px solid var(--brand-400)' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Content Scroll Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '2rem' }}>
              <div>
                {activeTab === 'intel' ? (
                  <>
                    <h3 style={{ fontSize: '1.125rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Info size={18} className="text-brand-400" />
                      Match Analysis & Job Intelligence
                    </h3>
                    <JdPanel jd={activeJob.jd_structured as any} rawDescription={activeJob.job_description} />
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Score */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.25rem', background: 'var(--bg-elevated)', borderRadius: '12px', border: '1px solid var(--bg-border)' }}>
                      <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: `conic-gradient(${scoreColor(activeJob.match_score)} ${activeJob.match_score}%, var(--bg-border) 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 700, color: scoreColor(activeJob.match_score) }}>
                          {Math.round(activeJob.match_score)}%
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{activeJob.match_label || (activeJob.match_score >= 75 ? 'Strong Match' : activeJob.match_score >= 50 ? 'Moderate Match' : 'Weak Match')}</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{activeJob.matched_skills.length} skills matched · {activeJob.missing_skills.length} missing</div>
                      </div>
                    </div>

                    {/* Skills */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {[
                        { label: 'Matched Skills', skills: activeJob.matched_skills, color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: CheckCircle2 },
                        { label: 'Missing Skills', skills: activeJob.missing_skills, color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: XCircle },
                        { label: 'Recommended', skills: activeJob.recommended_skills, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: Lightbulb },
                      ].map(({ label, skills, color, bg, icon: Icon }) => skills.length > 0 && (
                        <div key={label}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <Icon size={14} style={{ color }} />
                            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
                            <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.5rem', background: bg, color, borderRadius: '99px', fontWeight: 600 }}>{skills.length}</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {skills.map((s, i) => (
                              <span key={i} style={{ padding: '0.2rem 0.6rem', background: bg, color, borderRadius: '99px', fontSize: '0.8rem', fontWeight: 500 }}>{s}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Reasoning */}
                    {activeJob.reasoning && (
                      <div style={{ padding: '1rem', background: 'var(--bg-elevated)', borderRadius: '10px', border: '1px solid var(--bg-border)' }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI Analysis</div>
                        <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>{activeJob.reasoning}</p>
                      </div>
                    )}

                    {/* Strengths + Quick Wins */}
                    {((activeJob as any).strengths?.length > 0 || (activeJob as any).quick_wins?.length > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {(activeJob as any).strengths?.length > 0 && (
                          <div style={{ padding: '1rem', background: 'rgba(16,185,129,0.06)', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.2)' }}>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.75rem', color: '#10b981' }}>✦ Strengths</div>
                            <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {(activeJob as any).strengths.map((s: string, i: number) => <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s}</li>)}
                            </ul>
                          </div>
                        )}
                        {(activeJob as any).quick_wins?.length > 0 && (
                          <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.06)', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.2)' }}>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.75rem', color: '#f59e0b' }}>⚡ Quick Wins</div>
                            <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {(activeJob as any).quick_wins.map((s: string, i: number) => <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Experience Gaps */}
                    {activeJob.experience_gaps?.length > 0 && (
                      <div style={{ padding: '1rem', background: 'var(--bg-elevated)', borderRadius: '10px', border: '1px solid var(--bg-border)' }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Experience Gaps</div>
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {activeJob.experience_gaps.map((g, i) => <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{g}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sidebar Settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                <div className="card" style={{ background: 'var(--bg-elevated)' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Management</h4>
                  
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.5rem', fontWeight: 600 }}>Application Status</label>
                    <select 
                      value={activeJob.status} 
                      onChange={(e) => handleUpdate(activeJob.id, { status: e.target.value })}
                      className="input"
                    >
                      {STATUS_OPTIONS.filter(s => s !== 'all').map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </div>

                  <div style={{ marginBottom: '0.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.5rem', fontWeight: 600 }}>Priority Group</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {PRIORITY_GROUPS.map(p => (
                        <button
                          key={p.id}
                          onClick={() => handleUpdate(activeJob.id, { priority_group: p.id })}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem',
                            borderRadius: '8px', border: activeJob.priority_group === p.id ? `1px solid ${p.color}` : '1px solid transparent',
                            background: activeJob.priority_group === p.id ? p.bg : 'transparent',
                            textAlign: 'left', cursor: 'pointer', color: activeJob.priority_group === p.id ? p.color : 'var(--text-secondary)',
                            fontSize: '0.875rem', transition: 'all 0.2s'
                          }}
                        >
                          <p.icon size={14} /> {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Private Notes</h4>
                    {isEditingNotes ? (
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={handleSaveNotes} disabled={savingNote} style={{ padding: '2px', color: 'var(--accent-green)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                          {savingNote ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={16} />}
                        </button>
                        <button onClick={() => setIsEditingNotes(false)} style={{ padding: '2px', color: 'var(--accent-red)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setIsEditingNotes(true)} style={{ fontSize: '0.75rem', color: 'var(--brand-400)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                    )}
                  </div>
                  {isEditingNotes ? (
                    <textarea 
                      className="input" 
                      style={{ fontSize: '0.875rem', minHeight: '130px', resize: 'none' }} 
                      value={tempNotes} 
                      onChange={e => setTempNotes(e.target.value)}
                      placeholder="Add interview dates, requirements, or personal thoughts..."
                      autoFocus
                    />
                  ) : (
                    <div style={{ 
                      fontSize: '0.875rem', color: activeJob.notes ? 'var(--text-secondary)' : 'var(--text-muted)', 
                      whiteSpace: 'pre-wrap', minHeight: '60px', fontStyle: activeJob.notes ? 'normal' : 'italic',
                      lineHeight: 1.5, overflowWrap: 'break-word', wordBreak: 'break-word'
                    }}>
                      {activeJob.notes ? activeJob.notes.split(/(\s+)/).map((part, i) => {
                        if (part.match(/^(https?:\/\/[^\s]+)$|^(www\.[^\s]+)$|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/)) {
                          const href = part.startsWith('www.') ? `https://${part}` : part.includes('@') ? `mailto:${part}` : part;
                          return <a key={i} href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-400)', textDecoration: 'underline' }}>{part}</a>;
                        }
                        return part;
                      }) : "No notes yet. Click edit to add thoughts, interview details, or action items."}
                    </div>
                  )}
                </div>

                {/* Optimized Resume card */}
                <div className="card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText size={14} /> Optimized Resume
                  </h4>
                  {loadingOptimized ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      <div className="spinner" style={{ width: 14, height: 14 }} /> Loading…
                    </div>
                  ) : jobOptimized ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        Last generated {new Date(jobOptimized.created_at).toLocaleDateString()}
                      </p>
                      <button
                        type="button"
                        disabled={downloadingDocx}
                        className="btn btn-secondary btn-sm"
                        style={{ gap: '0.5rem', justifyContent: 'center' }}
                        onClick={async () => {
                          setDownloadingDocx(true);
                          try { await downloadOptimizedDocx(String(jobOptimized.id)); }
                          catch { toast.error('Download failed.'); }
                          finally { setDownloadingDocx(false); }
                        }}
                      >
                        <Download size={14} />
                        {downloadingDocx ? 'Downloading…' : 'Download DOCX'}
                      </button>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                      No optimized resume yet. Open the Analysis page to generate one.
                    </p>
                  )}
                </div>

                <div style={{ padding: '0 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={12} /> First tracked on {new Date(activeJob.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discovery Modal */}
      <JobDiscoveryModal
        isOpen={isDiscoveryOpen}
        onClose={() => setIsDiscoveryOpen(false)}
        onAdd={handleDiscoveryAdd}
        isAdding={submitting}
      />
    </div>
  );
}
