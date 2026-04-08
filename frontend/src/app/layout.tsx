import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import Navbar from '@/components/Navbar';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'AI Job Match Assistant',
  description: 'Analyze job postings against your resume and generate optimized resumes with AI',
  keywords: ['job match', 'resume optimization', 'AI', 'career assistant'],
  openGraph: {
    title: 'AI Job Match Assistant',
    description: 'AI-powered resume analysis and optimization',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="page-wrapper">
            <Navbar />
            <main>{children}</main>
          </div>
        </AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid #2a3a5c',
              borderRadius: '12px',
              fontSize: '0.875rem',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#fff' },
            },
          }}
        />
      </body>
    </html>
  );
}
