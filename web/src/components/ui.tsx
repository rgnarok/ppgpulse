import type { ReactNode } from 'react';

export function KpiCard({
  tone,
  icon,
  label,
  value,
  sub,
}: {
  tone: 'blue' | 'sky' | 'sand' | 'gold' | 'green' | 'violet' | 'teal';
  icon: string;
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className={`kc ${tone}`}>
      <span className="ki">{icon}</span>
      <div className="kl">{label}</div>
      <div className="kn">{value}</div>
      {sub && <div className="ks">{sub}</div>}
    </div>
  );
}

/** A plain KPI card with a headline number plus an even split of sub-metrics
 * below a divider (e.g. "Total Requirements" broken into RADC / RADF). */
export function SplitStatCard({
  icon,
  label,
  value,
  sub,
  splits,
}: {
  icon: string;
  label: string;
  value: ReactNode;
  sub?: string;
  splits: { value: ReactNode; label: string; color?: string }[];
}) {
  return (
    <div className="skc">
      <div className="skc-head">
        <span className="dot" />
        {icon} {label}
      </div>
      <div className="skc-num">{value}</div>
      {sub && <div className="skc-sub">{sub}</div>}
      <div className="skc-split">
        {splits.map((s, i) => (
          <div className="skc-split-item" key={i}>
            <div className="skc-split-val" style={s.color ? { color: s.color } : undefined}>
              {s.value}
            </div>
            <div className="skc-split-cap">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Card({
  children,
  pad = true,
  className = '',
}: {
  children: ReactNode;
  pad?: boolean;
  className?: string;
}) {
  return <div className={`card ${pad ? 'pad' : ''} ${className}`}>{children}</div>;
}

export function SectionTitle({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div className="sec-t">
      <span className="dot" style={color ? { background: color } : undefined} />
      {children}
    </div>
  );
}

const PILL_TONES: Record<string, string> = {
  Active: 'p-blue',
  'On Hold': 'p-amber',
  Closed: 'p-green',
  RADC: 'p-violet',
  RADF: 'p-blue',
  Internal: 'p-grey',
};

export function Pill({ children, tone }: { children: string; tone?: string }) {
  const cls = tone ?? PILL_TONES[children] ?? 'p-grey';
  return <span className={`pill ${cls}`}>{children}</span>;
}

export function Empty({
  icon = '◔',
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="em-ic">{icon}</div>
      <h4>{title}</h4>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Btn({
  children,
  variant = 'pri',
  onClick,
  type = 'button',
  disabled,
  small,
}: {
  children: ReactNode;
  variant?: 'pri' | 'gho';
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${small ? 'btn-sm' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function ScopeNote({ children }: { children: ReactNode }) {
  return <div className="scope-note">🔒 {children}</div>;
}
