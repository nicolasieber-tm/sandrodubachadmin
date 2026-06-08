type Status = 'neu' | 'bestaetigt' | 'abgesagt' | 'erledigt';

interface StatusBadgeProps {
  status: Status;
}

const STATUS_CONFIG: Record<Status, { label: string; cls: string }> = {
  neu:        { label: 'Neu',        cls: 'st-new'  },
  bestaetigt: { label: 'Bestätigt', cls: 'st-conf' },
  abgesagt:   { label: 'Abgesagt',  cls: 'st-canc' },
  erledigt:   { label: 'Erledigt',  cls: 'st-done' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, cls } = STATUS_CONFIG[status];
  return (
    <span className={`badge-status ${cls}`}>
      <span className="pip" />
      {label}
    </span>
  );
}
