interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

export function KpiCard({
  label,
  value,
  sub,
  accent = 'var(--accent)',
}: KpiCardProps) {
  return (
    <div
      className="kpi"
      style={{ '--bar': accent } as React.CSSProperties}
    >
      <div className="kpi-label">{label}</div>
      <div className="kpi-val num">{value}</div>
      {sub && <div className="kpi-sub mut">{sub}</div>}
    </div>
  );
}
