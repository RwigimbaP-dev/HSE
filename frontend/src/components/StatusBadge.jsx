export default function StatusBadge({ status, type = 'visit' }) {
  if (!status) return <span className="badge badge-na">N/A</span>;

  const visitMap = {
    IN: 'badge-in',
    OUT: 'badge-out',
  };
  const inductionMap = {
    passed: 'badge-passed',
    failed: 'badge-failed',
    pending: 'badge-pending',
  };

  const cls = type === 'visit' ? visitMap[status] : inductionMap[status];
  return <span className={`badge ${cls || 'badge-na'}`}>{status.toUpperCase()}</span>;
}
