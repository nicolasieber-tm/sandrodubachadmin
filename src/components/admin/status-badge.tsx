import { STATUS_LABEL, statusBadgeClass, type BookingStatusValue } from '@/bookings/status';

export function StatusBadge({ status }: { status: BookingStatusValue }) {
  return (
    <span className={`badge-status ${statusBadgeClass(status)}`}>
      <span className="pip" />
      {STATUS_LABEL[status]}
    </span>
  );
}
