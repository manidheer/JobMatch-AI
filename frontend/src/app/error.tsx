'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GlobalError] Unhandled boundary error:', error);
    }
  }, [error]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: '1.5rem',
      textAlign: 'center',
      padding: '2rem',
    }}>
      <div style={{
        width: '64px',
        height: '64px',
        background: 'rgba(239,68,68,0.1)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <AlertTriangle size={28} style={{ color: 'var(--accent-red)' }} />
      </div>

      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          Something went wrong
        </h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.6 }}>
          An unexpected error occurred. This is likely a temporary issue — try refreshing the page.
        </p>
        {process.env.NODE_ENV === 'development' && error.message && (
          <pre style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: 'var(--bg-elevated)',
            borderRadius: '8px',
            fontSize: '0.75rem',
            color: 'var(--accent-red)',
            maxWidth: '480px',
            textAlign: 'left',
            overflowX: 'auto',
          }}>
            {error.message}
          </pre>
        )}
      </div>

      <button
        onClick={reset}
        className="btn btn-primary"
        style={{ gap: '0.5rem' }}
      >
        <RefreshCw size={16} />
        Try Again
      </button>
    </div>
  );
}
