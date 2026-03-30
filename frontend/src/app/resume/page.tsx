'use client';
import { useState, useEffect } from 'react';
import ResumeUpload from '@/components/ResumeUpload';
import { Resume } from '@/types';
import { getCurrentResume, updateResume } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { CheckCircle, Briefcase, GraduationCap, Code, User, RefreshCw, Edit2, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ResumePage() {
  useRequireAuth();
  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'skills' | 'experience' | 'education' | 'projects'>('skills');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getCurrentResume()
      .then(setResume)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tabs = [
    { key: 'skills', label: 'Skills', icon: Code, count: resume?.skills.length },
    { key: 'experience', label: 'Experience', icon: Briefcase, count: resume?.experience.length },
    { key: 'education', label: 'Education', icon: GraduationCap, count: resume?.education.length },
    { key: 'projects', label: 'Projects', icon: Code, count: resume?.projects.length },
  ] as const;

  const handleSave = async () => {
    if (!resume) return;
    setIsSaving(true);
    try {
      const parsed = JSON.parse(editContent);
      const updated = await updateResume(resume.id, {
        skills: parsed.skills,
        experience: parsed.experience,
        education: parsed.education,
        projects: parsed.projects,
        summary: parsed.summary,
      });
      setResume(updated);
      setIsEditing(false);
      toast.success('Resume updated');
    } catch (e: any) {
      toast.error('Failed to save. Ensure JSON is valid.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="content-area">
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.875rem', marginBottom: '0.375rem' }}>Resume</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
          Upload your resume once — we'll analyze it for every job you check.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: resume ? '1fr 1.4fr' : '1fr', gap: '1.5rem' }}>
        {/* Upload section */}
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1rem' }}>
                {resume ? '✅ Resume Active' : 'Upload Your Resume'}
              </h2>
              {resume && (
                <button
                  onClick={() => setResume(null)}
                  className="btn btn-ghost btn-sm"
                  title="Replace resume"
                >
                  <RefreshCw size={14} /> Replace
                </button>
              )}
            </div>
            <ResumeUpload onSuccess={setResume} />
          </div>

          {/* Resume summary card */}
          {resume && (
            <div className="card" style={{ borderColor: 'rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <User size={18} style={{ color: 'var(--accent-green)' }} />
                <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Professional Summary</h3>
              </div>
              {resume.summary ? (
                <p style={{
                  fontSize: '0.8125rem',
                  lineHeight: 1.7,
                  color: 'var(--text-secondary)',
                }}>
                  {resume.summary}
                </p>
              ) : (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  No summary extracted.
                </p>
              )}

              <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span className="badge badge-green">{resume.skills.length} Skills</span>
                <span className="badge badge-blue">{resume.experience.length} Roles</span>
                <span className="badge badge-orange">{resume.education.length} Degrees</span>
                <span className="badge badge-purple">{resume.projects.length} Projects</span>
              </div>
            </div>
          )}
        </div>

        {/* Parsed Content */}
        {resume && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--bg-border)', paddingBottom: '0.875rem' }}>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {tabs.map(({ key, label, icon: Icon, count }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`btn btn-sm ${activeTab === key ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ gap: '0.375rem', padding: '0.4rem 0.875rem' }}
                    disabled={isEditing}
                  >
                    <Icon size={13} />
                    {label}
                    {(count ?? 0) > 0 && (
                      <span style={{
                        background: activeTab === key ? 'rgba(255,255,255,0.2)' : 'var(--bg-border)',
                        borderRadius: '999px',
                        padding: '0 5px',
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div>
                {!isEditing ? (
                  <button onClick={() => {
                    setEditContent(JSON.stringify({
                      summary: resume.summary,
                      skills: resume.skills,
                      experience: resume.experience,
                      education: resume.education,
                      projects: resume.projects,
                    }, null, 2));
                    setIsEditing(true);
                  }} className="btn btn-ghost btn-sm">
                    <Edit2 size={14} /> Edit Data
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => setIsEditing(false)} className="btn btn-ghost btn-sm">
                      <X size={14} /> Cancel
                    </button>
                    <button onClick={handleSave} className="btn btn-primary btn-sm" disabled={isSaving}>
                      <Save size={14} /> {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Tab Content */}
            <div style={{ overflowY: 'auto', maxHeight: '480px', paddingRight: '0.25rem' }}>
              {isEditing ? (
                <div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    Edit the raw JSON data below to update your extracted resume details.
                  </p>
                  <textarea
                    className="input"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    style={{
                      fontFamily: 'monospace',
                      minHeight: '400px',
                      fontSize: '0.8125rem',
                      whiteSpace: 'pre',
                    }}
                  />
                </div>
              ) : activeTab === 'skills' ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {resume.skills.map((s) => (
                    <span key={s} className="skill-chip skill-recommended">{s}</span>
                  ))}
                  {!resume.skills.length && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No skills extracted.</p>
                  )}
                </div>
              ) : activeTab === 'experience' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {resume.experience.map((exp, i) => (
                    <div key={i} style={{
                      borderLeft: '3px solid var(--brand-500)',
                      paddingLeft: '1rem',
                    }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                        {exp.title}
                      </div>
                      <div style={{ color: 'var(--brand-400)', fontSize: '0.8125rem', marginBottom: '0.125rem' }}>
                        {exp.company}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.625rem' }}>
                        {exp.duration}
                      </div>
                      {exp.bullets?.length > 0 && (
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {exp.bullets.slice(0, 4).map((b, bi) => (
                            <li key={bi} style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.375rem' }}>
                              <span style={{ color: 'var(--brand-400)', marginTop: '2px' }}>▸</span>
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  {!resume.experience.length && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No experience extracted.</p>
                  )}
                </div>
              ) : activeTab === 'education' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {resume.education.map((edu, i) => (
                    <div key={i} className="card-elevated" style={{ padding: '0.875rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.25rem' }}>
                        {edu.degree} {edu.field ? `in ${edu.field}` : ''}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{edu.institution}</div>
                      {edu.year && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{edu.year}</div>}
                    </div>
                  ))}
                  {!resume.education.length && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No education extracted.</p>
                  )}
                </div>
              ) : activeTab === 'projects' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {resume.projects.map((proj, i) => (
                    <div key={i} className="card-elevated" style={{ padding: '0.875rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.375rem' }}>{proj.name}</div>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', lineHeight: 1.6 }}>
                        {proj.description}
                      </p>
                      {proj.technologies?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                          {proj.technologies.map((t) => (
                            <span key={t} className="skill-chip skill-recommended" style={{ fontSize: '0.6875rem' }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {!resume.projects.length && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No projects extracted.</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
