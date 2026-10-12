export function MaterialIcon({ name, className = '' }) {
  return (
    <span className={`material-icon ${className}`.trim()} aria-hidden="true">
      {name}
    </span>
  );
}
