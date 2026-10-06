export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`logo ${inverse ? 'inverse' : ''}`}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
        <path d="M4 8h9v16H4zM19 8h9v16h-9zM11 14h10v4H11z" />
      </svg>
      <span>
        pact<span className="logo-period">.</span>
      </span>
    </span>
  );
}
