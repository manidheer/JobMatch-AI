'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { register as apiRegister } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getErrorMessage } from '@/lib/api';

export default function RegisterPage() {
  const { login, token, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (!isLoading && token) router.replace('/');
  }, [isLoading, token, router]);

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
      const res = await apiRegister(email.trim(), password);
      login(res.access_token, res.user);
      toast.success('Account created! Welcome to JobMatch AI.');
      router.replace('/');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Registration failed.'));
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
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            background: 'var(--accent-gradient)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem', marginBottom: '1rem',
          }}>🎯</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Create account</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
            Get started with JobMatch AI
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              style={{
                width: '100%', padding: '0.65rem 0.9rem', borderRadius: '10px',
                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
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
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
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
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
