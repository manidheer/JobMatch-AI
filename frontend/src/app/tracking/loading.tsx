export default function TrackingLoading() {
  return (
    <div className="content-area">
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="skeleton" style={{ height: '32px', width: '220px', borderRadius: '8px', marginBottom: '8px' }} />
          <div className="skeleton" style={{ height: '16px', width: '320px', borderRadius: '6px' }} />
        </div>
        <div className="skeleton" style={{ height: '38px', width: '180px', borderRadius: '12px' }} />
      </div>

      {/* Kanban groups skeleton */}
      {[1, 2, 3, 4].map((group) => (
        <div key={group} style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="skeleton" style={{ width: '28px', height: '28px', borderRadius: '6px' }} />
            <div className="skeleton" style={{ height: '18px', width: '120px', borderRadius: '6px' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {[1, 2].map((card) => (
              <div key={card} className="skeleton" style={{ height: '130px', borderRadius: '16px' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
