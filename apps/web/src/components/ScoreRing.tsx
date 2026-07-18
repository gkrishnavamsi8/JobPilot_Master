interface Props {
  score: number; // 0..100
  size?: number;
  strokeWidth?: number;
}

/**
 * Circular match gauge. Magnitude is encoded by arc length on a single brand
 * hue (sequential rule); the number itself is the hero and stays in ink.
 */
export function ScoreRing({ score, size = 72, strokeWidth = 7 }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-panel-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-brand-400)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold leading-none text-ink">
          {Math.round(clamped)}
          <span className="text-[10px] font-semibold text-ink-2">%</span>
        </span>
      </div>
    </div>
  );
}
