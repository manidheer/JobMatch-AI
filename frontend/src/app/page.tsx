'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCurrentResume, getTrackedJobs, getDashboardStats } from '@/lib/api';
import { Resume, AnalysisResult, DashboardStats } from '@/types';
import { useRequireAuth } from '@/lib/auth';
import {
  Upload, Briefcase, TrendingUp, Target, CheckCircle,
  AlertTriangle, Sparkles, ArrowRight, BookOpen, Zap,
} from 'lucide-react';

export default function DashboardPage() {
  useRequireAuth();
  const [resume, setResume] = useState<Resume | null>(null);
  const [recentJobs, setRecentJobs] = useState<AnalysisResult[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [r, j, s] = await Promise.allSettled([
          getCurrentResume(),
          getTrackedJobs(),
          getDashboardStats(),
        ]);
        if (r.status === 'fulfilled') setResume(r.value);
        if (j.status === 'fulfilled') setRecentJobs(j.value.slice(0, 5));
        if (s.status === 'fulfilled') setStats(s.value);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const scoreColor = (s: number) =>
    s >= 75 ? 'var(--accent-green)' : s >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';

  const statItems = stats ? [
    {
      label: 'Jobs Analyzed',
      value: stats.total_jobs_analyzed,
      icon: Briefcase,
      color: 'var(--brand-400)',
      glow: 'rgba(59,130,246,0.15)',
      suffix: '',
    },
    {
      label: 'Avg Match Score',
      value: stats.average_match_score,
      icon: Target,
      color: scoreColor(stats.average_match_score),
      glow: 'rgba(16,185,129,0.15)',
      suffix: '%',
    },
    {
      label: 'Applied',
      value: stats.jobs_applied,
      icon: CheckCircle,
      color: 'var(--accent-green)',
      glow: 'rgba(16,185,129,0.15)',
      suffix: '',
    },
    {
      label: 'Skill Gap',
      value: stats.top_missing_skills[0] || '—',
      icon: TrendingUp,
      color: 'var(--accent-orange)',
      glow: 'rgba(245,158,11,0.15)',
      suffix: '',
    },
  ] : [];

  const onboardingSteps = [
    {
      done: !!resume,
      label: 'Upload your resume',
      desc: 'Parse your skills, experience & education',
      href: '/resume',
      icon: '📄',
    },
    {
      done: (stats?.total_jobs_analyzed ?? 0) > 0,
      label: 'Analyze a job posting',
      desc: 'See how well you match with AI insights',
      href: '/jobs',
      icon: '🔍',
    },
    {
      done: (stats?.jobs_applied ?? 0) > 0,
      label: 'Track your applications',
      desc: 'Manage the status of every opportunity',
      href: '/tracking',
      icon: '📊',
    },
  ];

  const isNewUser = !resume && (stats?.total_jobs_analyzed ?? 0) === 0;

  return (
    <div className="content-area animate-fadeUp">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="hero-card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{
              fontSize: '2.25rem',
              fontWeight: 800,
              marginBottom: '0.5rem',
              lineHeight: 1.1,
            }}>
              Welcome to{' '}
              <span className="gradient-text">JobMatch AI</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.0625rem', maxWidth: '520px', lineHeight: 1.6 }}>
              Your AI-powered career assistant — analyze job fit, close skill gaps, and land more interviews.
            </p>
          </div>

          {resume && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '0.375rem',
            }}>
              <span className="badge badge-green" style={{ fontSize: '0.8125rem' }}>
                <CheckCircle size={12} /> Resume Active
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{resume.filename}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Onboarding checklist for new users ──────────────────────── */}
      {isNewUser && !loading && (
        <div className="card" style={{ marginBottom: '2rem', borderColor: 'rgba(59,130,246,0.2)', background: 'rgba(59,130,246,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
            <Sparkles size={18} style={{ color: 'var(--brand-400)' }} />
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Get started in 3 steps</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {onboardingSteps.map((step, i) => (
              <Link
                key={i}
                href={step.href}
                className={`checklist-item ${step.done ? 'done' : ''}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{
                  width: '32px', height: '32px',
                  borderRadius: '8px',
                  background: step.done ? 'rgba(16,185,129,0.12)' : 'var(--bg-elevated)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: '1rem',
                }}>
                  {step.done ? <CheckCircle size={16} style={{ color: 'var(--accent-green)' }} /> : step.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', textDecoration: step.done ? 'line-through' : 'none', opacity: step.done ? 0.5 : 1 }}>
                    {step.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{step.desc}</div>
                </div>
                {!step.done && <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Stats cards ───────────────────────────────────────────────── */}
      {stats && !loading && (
        <div className="dashboard-stats-grid">
          {statItems.map(({ label, value, icon: Icon, color, glow, suffix }) => (
            <div key={label} className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{
                  width: '38px', height: '38px',
                  background: glow,
                  borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} style={{ color }} />
                </div>
              </div>
              <div className="animate-countUp" style={{ fontSize: '1.75rem', fontWeight: 800, color, lineHeight: 1, marginBottom: '0.375rem' }}>
                {typeof value === 'number' ? Math.round(value) : value}{suffix}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────── */}
      {loading && (
        <div className="dashboard-stats-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: '110px', borderRadius: '16px' }} />
          ))}
        </div>
      )}

      <div className={resume ? 'dashboard-two-col' : ''}>
        {/* Resume status */}
        <div className="card" style={{ gridColumn: !resume ? '1 / -1' : 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{
              width: '36px', height: '36px',
              background: resume ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
              borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {resume
                ? <CheckCircle size={18} style={{ color: 'var(--accent-green)' }} />
                : <Upload size={18} style={{ color: 'var(--accent-orange)' }} />}
            </div>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Your Resume</h2>
          </div>

          {resume ? (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
                <span className="badge badge-green"><CheckCircle size={11} /> Uploaded</span>
                <span className="badge badge-blue">{resume.skills.length} skills</span>
                <span className="badge badge-purple">{resume.experience.length} roles</span>
                <span className="badge badge-orange">{resume.education.length} degrees</span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '0.875rem' }}>
                {resume.filename}
              </p>
              {resume.summary && (
                <p style={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  background: 'var(--bg-elevated)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  borderLeft: '3px solid var(--brand-500)',
                  marginBottom: '0.875rem',
                }}>
                  {resume.summary}
                </p>
              )}
              <Link href="/resume" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                Update Resume
              </Link>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div className="animate-float" style={{ display: 'inline-block', marginBottom: '0.875rem' }}>
                <Upload size={44} style={{ color: 'var(--text-muted)' }} />
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Upload your resume to get started
              </p>
              <Link href="/resume" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                <Upload size={15} /> Upload Resume
              </Link>
            </div>
          )}
        </div>

        {/* Recent analyses */}
        {recentJobs.length > 0 && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1rem' }}>Recent Analyses</h2>
              <Link href="/tracking" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', fontSize: '0.75rem' }}>
                View All →
              </Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.625rem 0.875rem',
                    background: 'var(--bg-elevated)',
                    borderRadius: '10px',
                    border: '1px solid var(--bg-border)',
                    transition: 'var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)';
                  }}
                >
                  <div style={{
                    width: '40px', height: '40px',
                    borderRadius: '50%',
                    background: `${scoreColor(job.match_score)}20`,
                    border: `2px solid ${scoreColor(job.match_score)}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: scoreColor(job.match_score) }}>
                      {Math.round(job.match_score)}%
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {job.job_title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {job.company || 'Unknown'}
                    </div>
                  </div>
                  <span className={`badge ${job.status === 'applied' ? 'badge-green' : job.status === 'interviewing' ? 'badge-purple' : 'badge-blue'}`}
                    style={{ fontSize: '0.625rem' }}>
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Top skill gap tip ────────────────────────────────────────── */}
      {stats && stats.top_missing_skills.length > 0 && (
        <div className="alert alert-info" style={{ marginTop: '1.5rem' }}>
          <Zap size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong>Skill gap spotlight:</strong>{' '}
            <span style={{ color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--brand-400)' }}>{stats.top_missing_skills[0]}</strong> appears most often as a missing requirement across your tracked jobs.
            </span>
            {stats.top_missing_skills.length > 1 && (
              <div style={{ marginTop: '0.375rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {stats.top_missing_skills.slice(1, 5).map((s) => (
                  <span key={s} className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{s}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Quick Actions ────────────────────────────────────────────── */}
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          Quick Actions
        </h2>
        <div className="dashboard-actions-grid">
          {[
            { href: '/resume', icon: '📄', label: 'Upload Resume', desc: 'PDF or DOCX', color: '#3b82f6' },
            { href: '/jobs', icon: '🔍', label: 'Search Jobs', desc: 'Find matching roles', color: '#8b5cf6' },
            { href: '/jobs', icon: '🔗', label: 'Paste Job URL', desc: 'LinkedIn, Indeed…', color: '#10b981' },
            { href: '/tracking', icon: '📊', label: 'Job Tracker', desc: 'Track applications', color: '#f59e0b' },
          ].map(({ href, icon, label, desc, color }) => (
            <Link
              key={href + label}
              href={href}
              style={{ textDecoration: 'none' }}
              className="card"
            >
              <div style={{
                width: '48px', height: '48px',
                background: `${color}15`,
                borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.375rem',
                marginBottom: '0.75rem',
                transition: 'transform 0.2s ease',
              }}>
                {icon}
              </div>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{label}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
