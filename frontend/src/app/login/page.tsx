'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { login as apiLogin } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getErrorMessage } from '@/lib/api';

export default function LoginPage() {
  const { login, token, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (!isLoading && token) router.replace('/');
  }, [isLoading, token, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiLogin(email.trim(), password);
      login(res.access_token, res.user);
      toast.success('Welcome back!');
      router.replace('/');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Login failed.'));
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
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Sign in</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
            Welcome back to JobMatch AI
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
              autoComplete="current-password"
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
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem' }}>
          <Link href="/forgot-password" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
            Forgot password?
          </Link>
        </p>

        <p style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          No account?{' '}
          <Link href="/register" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
