'use client';

interface StatusPrioritySelectorProps {
  status: string;
  setStatus: (status: string) => void;
  priority: string;
  setPriority: (priority: string) => void;
  variant?: 'compact' | 'full';
}

export default function StatusPrioritySelector({ 
  status, setStatus, priority, setPriority, variant = 'compact' 
}: StatusPrioritySelectorProps) {
  
  const containerStyle: React.CSSProperties = variant === 'compact' 
    ? { display: 'flex', gap: '0.75rem', alignItems: 'center' }
    : { display: 'flex', flexDirection: 'column' as const, gap: '1rem' };

  return (
    <div style={containerStyle}>
      <div style={{ flex: 1 }}>
        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 600 }}>INITIAL STATUS</label>
        <select 
          className="input" 
          style={{ height: '38px', fontSize: '0.8125rem' }} 
          value={status} 
          onChange={e => setStatus(e.target.value)}
        >
          <option value="analyzed">Analyzed</option>
          <option value="applied">Applied</option>
          <option value="interviewing">Interviewing</option>
          <option value="offer">Offer Received</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div style={{ flex: 1 }}>
        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 600 }}>INITIAL PRIORITY</label>
        <select 
          className="input" 
          style={{ height: '38px', fontSize: '0.8125rem' }} 
          value={priority} 
          onChange={e => setPriority(e.target.value)}
        >
          <option value="action_needed">🔥 Action Needed</option>
          <option value="worth">⭐ Worth Pursuit</option>
          <option value="normal">📋 Backlog</option>
          <option value="not_worth">👎 Not Worth</option>
        </select>
      </div>
    </div>
  );
}
