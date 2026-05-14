export function Label({ children, className = "" }) {
  return (
    <label className={className}>
      {children}
    </label>
  );
}