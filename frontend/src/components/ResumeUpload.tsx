'use client';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, CheckCircle, X, Type } from 'lucide-react';
import { uploadResume, uploadResumeText } from '@/lib/api';
import { Resume } from '@/types';
import toast from 'react-hot-toast';

interface ResumeUploadProps {
  onSuccess: (resume: Resume) => void;
}

export default function ResumeUpload({ onSuccess }: ResumeUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [resumeText, setResumeText] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/pdf',
    ];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(docx|doc|pdf)$/i)) {
      toast.error('Please upload a PDF or DOCX file.');
      return;
    }

    setUploadedFile(file);
    setIsUploading(true);

    try {
      const resume = await uploadResume(file);
      toast.success('Resume uploaded and parsed successfully!');
      onSuccess(resume);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Upload failed. Please try again.';
      toast.error(detail);
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
    }
  }, [onSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    disabled: isUploading || mode !== 'file',
  });

  const handleTextSubmit = async () => {
    if (!resumeText.trim()) {
      toast.error('Please paste your resume text first.');
      return;
    }
    
    setIsUploading(true);
    try {
      const resume = await uploadResumeText(resumeText);
      toast.success('Resume parsed successfully!');
      onSuccess(resume);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Parsing failed. Please try again.';
      toast.error(detail);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      {/* Mode Toggle */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
        <button 
          onClick={() => setMode('file')}
          className={`btn ${mode === 'file' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
          disabled={isUploading}
        >
          <Upload size={14} /> Upload File
        </button>
        <button 
          onClick={() => setMode('text')}
          className={`btn ${mode === 'text' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
          disabled={isUploading}
        >
          <Type size={14} /> Paste Text
        </button>
      </div>

      {mode === 'file' ? (
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'active' : ''}`}
          id="resume-dropzone"
          style={{ cursor: isUploading ? 'default' : 'pointer' }}
        >
          <input {...getInputProps()} id="resume-file-input" />

          {isUploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '64px',
                height: '64px',
                background: 'rgba(59,130,246,0.1)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <div className="spinner" style={{
                  width: '28px',
                  height: '28px',
                  borderColor: 'rgba(59,130,246,0.3)',
                  borderTopColor: 'var(--brand-500)',
                }} />
              </div>
              <div>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                  Analyzing your resume…
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  Extracting skills, experience, and education
                </p>
              </div>
            </div>
          ) : uploadedFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <CheckCircle size={48} style={{ color: 'var(--accent-green)' }} />
              <div>
                <p style={{ fontWeight: 600, color: 'var(--accent-green)' }}>Upload Successful</p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {uploadedFile.name}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setUploadedFile(null); }}
                className="btn btn-ghost btn-sm"
              >
                <X size={14} /> Upload Different File
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '72px',
                height: '72px',
                background: isDragActive ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s',
              }}>
                <Upload size={32} style={{ color: isDragActive ? 'var(--brand-400)' : 'var(--text-muted)' }} />
              </div>

              <div>
                <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                  {isDragActive ? 'Drop your resume here' : 'Drag & drop your resume'}
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  or click to browse — PDF or Word Document (.docx) up to 10 MB
                </p>
              </div>
 
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className="badge badge-red">
                  <FileText size={11} /> PDF 
                </span>
                <span className="badge badge-blue">
                  <FileText size={11} /> DOCX
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="dropzone" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem', cursor: 'default' }}>
          <div>
             <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.375rem', textAlign: 'center' }}>
                Paste your resume content
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Copy all text from your resume and paste it below.
              </p>
          </div>
          <textarea 
            className="input" 
            placeholder="Experience, Skills, Education..."
            value={resumeText}
            onChange={e => setResumeText(e.target.value)}
            disabled={isUploading}
            style={{ minHeight: '200px', resize: 'vertical', fontSize: '0.875rem' }}
          />
          <button 
            className="btn btn-primary" 
            onClick={handleTextSubmit}
            disabled={isUploading || !resumeText.trim()}
            style={{ alignSelf: 'center' }}
          >
             {isUploading ? <><div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: '#fff'}}/> Analyzing...</>  : 'Analyze Resume Text' }
          </button>
        </div>
      )}
    </div>
  );
}
