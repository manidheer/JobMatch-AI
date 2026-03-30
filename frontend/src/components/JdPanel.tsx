'use client';
import { useState } from 'react';
import { JdStructured } from '@/types';
import {
  Briefcase, MapPin, Clock, GraduationCap, Users, ShieldCheck,
  DollarSign, ChevronRight, Star, Zap, Globe, AlertTriangle,
} from 'lucide-react';

interface Props {
  jd: JdStructured;
  rawDescription?: string;
}

type Tab = 'overview' | 'skills' | 'details' | 'raw';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: '1.125rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
        <Icon size={13} style={{ color: 'var(--brand-400)', flexShrink: 0 }} />
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'var(--text-muted)',
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

type ChipColor = 'green' | 'blue' | 'orange' | 'red' | 'default';

const PALETTES: Record<ChipColor, { bg: string; text: string; border: string }> = {
  green:   { bg: 'rgba(34,197,94,0.1)',    text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
  blue:    { bg: 'rgba(59,130,246,0.1)',   text: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  orange:  { bg: 'rgba(245,158,11,0.1)',   text: '#fbbf24', border: 'rgba(245,158,11,0.25)' },
  red:     { bg: 'rgba(239,68,68,0.1)',    text: '#f87171', border: 'rgba(239,68,68,0.25)' },
  default: { bg: 'rgba(148,163,184,0.08)', text: 'var(--text-secondary)', border: 'rgba(148,163,184,0.18)' },
};

function Chip({ label, color = 'default' }: { label: string; color?: ChipColor }) {
  const p = PALETTES[color];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '0.2rem 0.55rem', borderRadius: '99px',
      fontSize: '0.73rem', fontWeight: 500,
      background: p.bg, color: p.text, border: `1px solid ${p.border}`,
    }}>
      {label}
    </span>
  );
}

function ChipGroup({ items, color }: { items: string[]; color?: ChipColor }) {
  if (!items?.length) return <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
      {items.map((s, i) => <Chip key={i} label={s} color={color} />)}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const empty = !value || value === 'null' || value === 'Not specified';
  if (empty) return null;
  return (
    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
      <span style={{ color: 'var(--text-muted)', minWidth: '105px', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function clean(v?: string | null) {
  return v && v !== 'null' && v !== 'Not specified' ? v : null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function JdPanel({ jd, rawDescription }: Props) {
  const [tab, setTab] = useState<Tab>('overview');

  const role = jd?.role              ?? {} as any;
  const tech = jd?.technical         ?? {} as any;
  const exp  = jd?.experience        ?? {} as any;
  const edu  = jd?.education         ?? {} as any;
  const cul  = jd?.culture           ?? {} as any;
  const elig = jd?.eligibility       ?? {} as any;
  const comp = jd?.compensation      ?? {} as any;
  const resp = jd?.responsibilities  ?? {} as any;
  const sig  = jd?.recruiter_signals ?? {} as any;

  const reqSkills:  string[] = tech.required_skills        ?? [];
  const prefSkills: string[] = tech.preferred_skills       ?? [];
  const softSkills: string[] = cul.soft_skills             ?? [];
  const domains:    string[] = exp.domain_experience       ?? [];
  const resps:      string[] = resp.key_responsibilities   ?? [];
  const certReq:    string[] = edu.certifications_required ?? [];
  const certPref:   string[] = edu.certifications_preferred ?? [];
  const benefits:   string[] = comp.benefits_highlights    ?? [];
  const redFlags:   string[] = sig.red_flags               ?? [];

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: '🏢 Overview' },
    { id: 'skills',   label: `⚡ Skills (${reqSkills.length + prefSkills.length})` },
    { id: 'details',  label: '📋 Details' },
    { id: 'raw',      label: '📄 Raw JD' },
  ];

  const tabBtn = (id: Tab): React.CSSProperties => ({
    padding: '0.3rem 0.65rem',
    borderRadius: '6px',
    fontSize: '0.73rem',
    fontWeight: tab === id ? 600 : 400,
    cursor: 'pointer',
    border: 'none',
    background: tab === id ? 'var(--brand-500)' : 'transparent',
    color: tab === id ? '#fff' : 'var(--text-muted)',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  return (
    <div>
      {/* Role header */}
      {(role.job_title || role.company_name) && (
        <div style={{ marginBottom: '0.875rem' }}>
          {role.job_title && (
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
              {role.job_title}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
            {role.company_name && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {role.company_name}
              </span>
            )}
            {clean(role.location) && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <MapPin size={11} /> {role.location}
              </span>
            )}
            {clean(role.remote_policy) && (role.remote_policy?.toLowerCase() !== role.location?.toLowerCase()) && (
               <Chip label={role.remote_policy as string} color="blue" />
            )}
            {clean(role.employment_type) && <Chip label={role.employment_type as string} color="default" />}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.125rem', marginBottom: '1rem',
        background: 'var(--bg-elevated)', borderRadius: '8px', padding: '0.25rem',
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tabBtn(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div>
          {clean(role.job_summary) && (
            <Section icon={Briefcase} title="Role Summary">
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
                {role.job_summary}
              </p>
            </Section>
          )}

          {resps.length > 0 && (
            <Section icon={ChevronRight} title={`Key Responsibilities (${resps.length})`}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {resps.map((r, i) => (
                  <li key={i} style={{ display: 'flex', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    <span style={{ color: 'var(--brand-400)', flexShrink: 0, marginTop: '0.15rem' }}>▸</span>
                    {r}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section icon={Clock} title="Experience">
            {clean(exp.seniority_level) && (
              <InfoRow label="Level" value={(exp.seniority_level as string).charAt(0).toUpperCase() + (exp.seniority_level as string).slice(1)} />
            )}
            {exp.years_min != null && (
              <InfoRow label="Years" value={exp.years_max ? `${exp.years_min}–${exp.years_max} yrs` : `${exp.years_min}+ yrs`} />
            )}
            {exp.leadership_required && (
              <InfoRow label="Leadership" value={clean(exp.leadership_description) ?? 'Required'} />
            )}
            {domains.length > 0 && (
              <div style={{ marginTop: '0.4rem' }}><ChipGroup items={domains} color="orange" /></div>
            )}
            {!clean(exp.seniority_level) && exp.years_min == null && domains.length === 0 && !exp.leadership_required && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not specified in JD</span>
            )}
          </Section>
        </div>
      )}

      {/* ── SKILLS ── */}
      {tab === 'skills' && (
        <div>
          <Section icon={Zap} title={`Required Skills (${reqSkills.length})`}>
            <ChipGroup items={reqSkills} color="green" />
          </Section>

          {prefSkills.length > 0 && (
            <Section icon={Star} title={`Nice-to-Have (${prefSkills.length})`}>
              <ChipGroup items={prefSkills} color="blue" />
            </Section>
          )}

          {softSkills.length > 0 && (
            <Section icon={Users} title="Soft Skills">
              <ChipGroup items={softSkills} color="default" />
            </Section>
          )}

          {clean(tech.technical_experience_notes) && (
            <Section icon={Briefcase} title="Depth Notes">
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                {tech.technical_experience_notes}
              </p>
            </Section>
          )}
        </div>
      )}

      {/* ── DETAILS ── */}
      {tab === 'details' && (
        <div>
          <Section icon={GraduationCap} title="Education">
            <InfoRow label="Required" value={clean(edu.degree_required)} />
            <InfoRow label="Preferred" value={clean(edu.degree_preferred)} />
            {edu.fields_of_study?.length > 0 && (
              <div style={{ marginTop: '0.4rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Fields</div>
                <ChipGroup items={edu.fields_of_study} />
              </div>
            )}
            {certReq.length > 0 && (
              <div style={{ marginTop: '0.4rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Required Certs</div>
                <ChipGroup items={certReq} color="orange" />
              </div>
            )}
            {certPref.length > 0 && (
              <div style={{ marginTop: '0.4rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Preferred Certs</div>
                <ChipGroup items={certPref} />
              </div>
            )}
            {!clean(edu.degree_required) && !edu.fields_of_study?.length && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not specified in JD</span>
            )}
          </Section>

            <Section icon={Globe} title="Culture & Work Style">
              <InfoRow label="Culture"     value={clean(cul.culture_signals)   ?? undefined} />
              <InfoRow label="Work Style"  value={clean(cul.work_style)         ?? undefined} />
              <InfoRow label="Team"        value={clean(cul.team_context)       ?? undefined} />
            </Section>

          <Section icon={ShieldCheck} title="Eligibility & Authorization">
            <InfoRow label="Visa Sponsorship"
              value={elig.visa_sponsorship === true  ? '✅ Offered'
                   : elig.visa_sponsorship === false ? '❌ Not offered'
                   : clean(elig.visa_sponsorship_note)} />
            <InfoRow label="Work Auth"   value={clean(elig.work_authorization_required)} />
            <InfoRow label="Clearance"   value={clean(elig.security_clearance_required)} />
            <InfoRow label="Citizenship" value={clean(elig.citizenship_note)} />
            {elig.visa_sponsorship == null && !clean(elig.work_authorization_required) && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No eligibility restrictions mentioned</span>
            )}
          </Section>

          {(clean(comp.salary_range) || comp.equity_mentioned || benefits.length > 0) && (
            <Section icon={DollarSign} title="Compensation">
              <InfoRow label="Salary"  value={clean(comp.salary_range)} />
              {comp.equity_mentioned && <InfoRow label="Equity" value="Mentioned" />}
              {benefits.length > 0 && (
                <div style={{ marginTop: '0.4rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Benefits</div>
                  <ChipGroup items={benefits} color="green" />
                </div>
              )}
            </Section>
          )}

          {(redFlags.length > 0 || clean(sig.important_notes)) && (
            <Section icon={AlertTriangle} title="Recruiter Notes">
              {redFlags.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Red Flags</div>
                  <ChipGroup items={redFlags} color="red" />
                </div>
              )}
              {clean(sig.important_notes) && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  {sig.important_notes}
                </p>
              )}
            </Section>
          )}
        </div>
      )}

      {/* ── RAW JD ── */}
      {tab === 'raw' && (
        <div style={{
          fontSize: '0.8rem', lineHeight: 1.65, color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap', maxHeight: '480px', overflowY: 'auto',
          background: 'var(--bg-elevated)', padding: '0.875rem',
          borderRadius: '6px', border: '1px solid var(--bg-border)',
        }}>
          {rawDescription || 'No raw description available.'}
        </div>
      )}
    </div>
  );
}
