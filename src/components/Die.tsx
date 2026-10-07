const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
}

interface Props {
  value: number
  held?: boolean
  rolling?: boolean
  size?: number
  color?: string
  onClick?: () => void
  disabled?: boolean
}

export function Die({ value, held, rolling, size = 56, color, onClick, disabled }: Props) {
  const content = (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-label={`주사위 ${value}`}>
      <rect x="4" y="4" width="92" height="92" rx="18" className="die-face" style={color ? { fill: color } : undefined} />
      {(PIPS[value] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="9" className={value === 1 ? 'die-pip red' : 'die-pip'} />
      ))}
    </svg>
  )
  const cls = `die ${held ? 'held' : ''} ${rolling ? 'rolling' : ''}`
  if (!onClick) return <span className={cls}>{content}</span>
  return (
    <button className={cls} onClick={onClick} disabled={disabled}>
      {content}
    </button>
  )
}
