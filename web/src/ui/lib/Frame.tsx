import type { CSSProperties, ReactNode } from 'react'

export function Frame({ className = '', style, children }: { className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div className={`blueprint ${className}`} style={style}>
      <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
      {children}
    </div>
  )
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <div className="logo" style={{ width: size, height: size }}>
      <svg width={size * 0.47} height={size * 0.53} viewBox="0 0 14 16" fill="none" stroke="#39ff88" strokeWidth="1.5" strokeLinejoin="round"><path d="M8 1 2 9h5l-1 6 6-8H7l1-6Z" /></svg>
    </div>
  )
}

export function Badge({ label, color }: { label: string; color: string }) {
  return <span className="badge" style={{ color, borderColor: color }}>{label}</span>
}
