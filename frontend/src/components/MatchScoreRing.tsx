'use client';

interface MatchScoreRingProps {
  score: number;
  size?: number;
}

/**
 * Animated circular progress ring showing match score 0–100.
 * Color transitions: red → orange → green based on score.
 */
export default function MatchScoreRing({ score, size = 120 }: MatchScoreRingProps) {
  const radius = 38; // Reduced slightly to leave room for glow/shadow
  const circumference = 2 * Math.PI * radius; 
  const offset = circumference - (score / 100) * circumference;

  const getColor = () => {
    if (score >= 75) return '#10b981'; // green
    if (score >= 50) return '#f59e0b'; // orange
    return '#ef4444';                  // red
  };

  const getLabel = () => {
    if (score >= 80) return 'Excellent';
    if (score >= 65) return 'Good';
    if (score >= 45) return 'Moderate';
    return 'Low';
  };

  const color = getColor();

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="score-ring"
        style={{ transform: 'rotate(-90deg)', position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
      >
        {/* Background track */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="8"
        />
        {/* Progress */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: `drop-shadow(0 0 8px ${color}80)`,
          }}
        />
      </svg>

      {/* Score text Centered Inside */}
      <div style={{
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
        userSelect: 'none'
      }}>
        <div style={{
          fontSize: size > 130 ? '2.125rem' : '1.75rem',
          fontWeight: 800,
          color,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          lineHeight: 1,
          letterSpacing: '-0.02em'
        }}>
          {score}%
        </div>
        <div style={{
          fontSize: size > 130 ? '0.75rem' : '0.625rem',
          color: 'var(--text-muted)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginTop: '0.125rem',
        }}>
          {getLabel()}
        </div>
      </div>
    </div>
  );
}
