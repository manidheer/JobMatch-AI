'use client';
import { useState, useEffect } from 'react';
import { 
  searchJobs, scrapeJobUrl, submitManualJob, extractJobDetails 
} from '@/lib/api';
import { JobListing } from '@/types';
import { 
  Search, Link2, FileText, X, Sparkles, Plus, 
  ArrowLeft 
} from 'lucide-react';
import toast from 'react-hot-toast';
import JobCard from '@/components/JobCard';
import JdPanel from '@/components/JdPanel';
import StatusPrioritySelector from '@/components/StatusPrioritySelector';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (job: JobListing, extractedJd?: any, status?: string, priority?: string) => Promise<void>;
  isAdding: boolean;
}

type Mode = 'search' | 'url' | 'manual';
type Step = 'input' | 'select' | 'extracted';

export default function JobDiscoveryModal({ isOpen, onClose, onAdd, isAdding }: Props) {
  const [mode, setMode] = useState<Mode>('search');
  const [step, setStep] = useState<Step>('input');
  
  // Inputs
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualCompany, setManualCompany] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [manualDesc, setManualDesc] = useState('');

  // Results
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [extractedJd, setExtractedJd] = useState<any>(null);

  // Loading
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // Metadata State
  const [status, setStatus] = useState('applied');
  const [priority, setPriority] = useState('normal');

  const reset = () => {
    setStep('input');
    setJobs([]);
    setSelectedJob(null);
    setExtractedJd(null);
    setSearchQuery('');
    setSearchLocation('');
    setPasteUrl('');
    setManualTitle('');
    setManualCompany('');
    setManualUrl('');
    setManualDesc('');
    setStatus('applied');
    setPriority('normal');
  };

  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddAction = (job: JobListing, jd?: any) => {
    onAdd(job, jd, status, priority);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await searchJobs(searchQuery, searchLocation);
      setJobs(res.jobs);
      setStep('select');
    } catch {
      toast.error('Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleScrape = async () => {
    if (!pasteUrl.trim()) return;
    setLoading(true);
    try {
      const job = await scrapeJobUrl(pasteUrl);
      setSelectedJob(job);
      setStep('select');
    } catch (err: any) {
      if (err?.response?.data?.detail?.includes('Could not extract')) {
        toast.error('Automatic reader blocked. Switching to manual.');
        setMode('manual');
        setManualUrl(pasteUrl);
      } else {
        toast.error('Failed to fetch listing');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManual = async () => {
    if (!manualTitle || !manualDesc) return;
    const job = await submitManualJob({
      job_title: manualTitle,
      company: manualCompany,
      job_url: manualUrl,
      job_description: manualDesc
    });
    setSelectedJob(job);
    setStep('select');
  };

  const handleExtract = async () => {
    if (!selectedJob) return;
    setExtracting(true);
    try {
      const res = await extractJobDetails({
        job_title: selectedJob.job_title,
        company: selectedJob.company ?? undefined,
        job_url: selectedJob.job_url ?? undefined,
        job_description: selectedJob.job_description,
      });
      setExtractedJd(res);
      setStep('extracted');
    } catch {
      toast.error('AI Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '2rem'
    }}>
      <div className="card" style={{ 
        width: '100%', maxWidth: step === 'input' ? '600px' : '1000px', 
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' 
      }}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--bg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {step !== 'input' && (
              <button onClick={() => setStep(step === 'extracted' ? 'select' : 'input')} className="btn btn-ghost btn-sm" style={{ padding: '0.25rem' }}>
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Track New Opportunity</h2>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="btn btn-ghost btn-sm"><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {step === 'input' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-elevated)', padding: '0.25rem', borderRadius: '10px' }}>
                {(['search', 'url', 'manual'] as Mode[]).map(m => (
                  <button 
                    key={m} 
                    onClick={() => setMode(m)}
                    className={`btn btn-sm ${mode === m ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, textTransform: 'capitalize', gap: '0.4rem' }}
                  >
                    {m === 'search' && <Search size={14} />}
                    {m === 'url' && <Link2 size={14} />}
                    {m === 'manual' && <FileText size={14} />}
                    {m}
                  </button>
                ))}
              </div>

              {mode === 'search' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <input className="input" placeholder="Desired Job Title..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  <input className="input" placeholder="Location..." value={searchLocation} onChange={e => setSearchLocation(e.target.value)} />
                  <button className="btn btn-primary" onClick={handleSearch} disabled={loading} style={{ height: '48px' }}>
                    {loading ? <div className="spinner" /> : 'Find Listings'}
                  </button>
                </div>
              )}

              {mode === 'url' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <input className="input" placeholder="Paste LinkedIn/Indeed URL..." value={pasteUrl} onChange={e => setPasteUrl(e.target.value)} />
                  <button className="btn btn-primary" onClick={handleScrape} disabled={loading} style={{ height: '48px' }}>
                    {loading ? <div className="spinner" /> : 'Fetch Details'}
                  </button>
                </div>
              )}

              {mode === 'manual' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <input className="input" placeholder="Job Title" value={manualTitle} onChange={e => setManualTitle(e.target.value)} />
                  <input className="input" placeholder="Company" value={manualCompany} onChange={e => setManualCompany(e.target.value)} />
                  <textarea className="input" placeholder="Job Description..." value={manualDesc} onChange={e => setManualDesc(e.target.value)} style={{ minHeight: '150px' }} />
                  <button className="btn btn-primary" onClick={handleManual} style={{ height: '48px' }}>Use This Content</button>
                </div>
              )}
            </div>
          )}

          {step === 'select' && (
            <div style={{ display: 'grid', gridTemplateColumns: jobs.length > 0 ? '350px 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
              {jobs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {jobs.map((j, i) => (
                    <JobCard key={i} job={j} selected={selectedJob === j} onClick={() => setSelectedJob(j)} />
                  ))}
                </div>
              )}
              {selectedJob && (
                <div className="card" style={{ borderLeft: '4px solid var(--brand-500)', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.125rem' }}>{selectedJob.job_title}</h3>
                      <p style={{ color: 'var(--text-secondary)' }}>{selectedJob.company}</p>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '12px', marginBottom: '1.25rem' }}>
                    <StatusPrioritySelector 
                      status={status} setStatus={setStatus} 
                      priority={priority} setPriority={setPriority} 
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => handleAddAction(selectedJob, null)} disabled={isAdding}>
                        Add Basic Info
                    </button>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleExtract} disabled={extracting}>
                      {extracting ? <div className="spinner" /> : <><Sparkles size={16} /> AI Supercharge</>}
                    </button>
                  </div>

                  <div style={{ flex: 1, maxHeight: '300px', overflowY: 'auto', fontSize: '0.875rem', whiteSpace: 'pre-wrap', color: 'var(--text-muted)', borderTop: '1px solid var(--bg-border)', paddingTop: '1rem' }}>
                    {selectedJob.job_description}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'extracted' && selectedJob && extractedJd && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', background: 'var(--bg-elevated)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--bg-border)' }}>
                  <div style={{ flex: 1, maxWidth: '400px' }}>
                    <StatusPrioritySelector 
                      status={status} setStatus={setStatus} 
                      priority={priority} setPriority={setPriority} 
                    />
                  </div>
                  <button className="btn btn-primary" onClick={() => handleAddAction(selectedJob, extractedJd)} disabled={isAdding} style={{ gap: '0.5rem', height: '48px', padding: '0 2rem' }}>
                    {isAdding ? <div className="spinner" /> : <><Plus size={18} /> Add to Tracking</>}
                  </button>
               </div>
               <JdPanel jd={extractedJd} rawDescription={selectedJob.job_description} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
