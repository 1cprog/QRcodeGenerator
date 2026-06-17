export function Button({
  children,
  className = "",
  variant = "default",
  size = "default",
  ...props
}) {
  const variantClass = variant === "ghost" ? "border-transparent" : "";
  const sizeClass = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2";

  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg border cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
