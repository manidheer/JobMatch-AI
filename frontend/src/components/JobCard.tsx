'use client';
import { MapPin, Briefcase, DollarSign, Clock, ExternalLink } from 'lucide-react';
import { JobListing } from '@/types';

interface JobCardProps {
  job: JobListing;
  selected?: boolean;
  onClick?: () => void;
}

export default function JobCard({ job, selected, onClick }: JobCardProps) {
  // Generate a consistent color per company initial
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
  const colorIndex = (job.company?.charCodeAt(0) || 0) % colors.length;
  const avatarColor = colors[colorIndex];

  return (
    <div
      className={`job-card ${selected ? 'selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      style={{ position: 'relative' }}
    >
      {selected && (
        <div style={{
          position: 'absolute',
          top: '0.875rem',
          right: '0.875rem',
          width: '20px',
          height: '20px',
          background: 'var(--brand-500)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
        {/* Company Avatar */}
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '10px',
          background: `${avatarColor}20`,
          border: `1px solid ${avatarColor}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.125rem',
          fontWeight: 700,
          color: avatarColor,
          flexShrink: 0,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>
          {job.company?.[0]?.toUpperCase() || '?'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600,
            fontSize: '0.9375rem',
            color: 'var(--text-primary)',
            marginBottom: '0.25rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {job.job_title}
          </div>
          <div style={{
            color: 'var(--text-secondary)',
            fontSize: '0.8125rem',
            marginBottom: '0.625rem',
            fontWeight: 500,
          }}>
            {job.company || 'Unknown Company'}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {job.location && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <MapPin size={11} /> {job.location}
              </span>
            )}
            {job.employment_type && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <Briefcase size={11} /> {job.employment_type}
              </span>
            )}
            {job.salary && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--accent-green)' }}>
                <DollarSign size={11} /> {job.salary}
              </span>
            )}
            {job.posted_date && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <Clock size={11} /> {job.posted_date}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Apply Link */}
      {job.job_url && (
        <a
          href={job.job_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            marginTop: '0.875rem',
            fontSize: '0.75rem',
            color: 'var(--brand-400)',
            fontWeight: 500,
            textDecoration: 'none',
            opacity: 0.8,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
        >
          <ExternalLink size={12} />
          View & Apply
        </a>
      )}
    </div>
  );
}
