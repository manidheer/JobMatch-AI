'use client';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { resetPassword } from '@/lib/api';
import { getErrorMessage } from '@/lib/api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error('Invalid or missing reset token.');
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      toast.success('Password updated! Redirecting to sign in…');
      setTimeout(() => router.replace('/login'), 2500);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Reset failed. The link may have expired.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        padding: '2.5rem',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            background: 'var(--accent-gradient)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem', marginBottom: '1rem',
          }}>🔒</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            {done ? 'Password updated!' : 'Set new password'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
            {done ? 'Redirecting you to sign in…' : 'Choose a strong password.'}
          </p>
        </div>

        {!done && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {!token && (
              <div style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: '10px',
                padding: '0.9rem',
                color: '#ef4444',
                fontSize: '0.85rem',
                textAlign: 'center',
              }}>
                Invalid or missing reset link.{' '}
                <Link href="/forgot-password" style={{ color: '#ef4444', fontWeight: 600 }}>
                  Request a new one.
                </Link>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={!token}
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                style={{
                  width: '100%', padding: '0.65rem 0.9rem', borderRadius: '10px',
                  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                Confirm new password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                disabled={!token}
                autoComplete="new-password"
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '0.65rem 0.9rem', borderRadius: '10px',
                  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem', opacity: (loading || !token) ? 0.7 : 1 }}
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        {!done && (
          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <Link href="/login" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>
              Back to sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
