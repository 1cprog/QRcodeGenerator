export function Button({
  children,
  className = "",
  variant = "default",
  size = "default",
  ...props
}) {
  return (
    <button
      className={`rounded-lg border px-4 py-2 cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}