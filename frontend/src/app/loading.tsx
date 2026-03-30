export default function GlobalLoading() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: '1.5rem',
    }}>
      {/* Animated logo mark */}
      <div style={{
        width: '56px',
        height: '56px',
        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.5rem',
        animation: 'pulse-glow 1.5s ease-in-out infinite',
        boxShadow: '0 0 30px rgba(59,130,246,0.3)',
      }}>
        🎯
      </div>

      {/* Skeleton rows */}
      <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div className="skeleton" style={{ height: '20px', width: '60%', borderRadius: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '90%', borderRadius: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '75%', borderRadius: '6px' }} />
      </div>
    </div>
  );
}
