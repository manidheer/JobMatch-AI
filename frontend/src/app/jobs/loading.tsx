export default function JobsLoading() {
  return (
    <div className="content-area">
      {/* Header skeleton */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div className="skeleton" style={{ height: '28px', width: '260px', borderRadius: '8px', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '16px', width: '380px', borderRadius: '6px' }} />
      </div>

      {/* Two-panel layout skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '1.5rem' }}>
        {/* Left panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="skeleton" style={{ height: '160px', borderRadius: '16px' }} />
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: '90px', borderRadius: '12px' }} />
          ))}
        </div>

        {/* Right panel */}
        <div className="skeleton" style={{ height: '450px', borderRadius: '16px' }} />
      </div>
    </div>
  );
}
