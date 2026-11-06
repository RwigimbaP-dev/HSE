export default function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 20, md: 32, lg: 48 };
  const s = sizes[size] || sizes.md;
  return (
    <div className={`spinner-wrapper ${className}`} style={{ width: s, height: s }}>
      <div className="spinner" style={{ width: s, height: s }} />
    </div>
  );
}
