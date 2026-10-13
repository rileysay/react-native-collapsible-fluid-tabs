export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <svg className="brand-mark" width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
        <rect x="2" y="4" width="7" height="17" rx="3.5" fill="currentColor" />
        <rect x="11.5" y="9" width="7" height="17" rx="3.5" fill="currentColor" />
        <rect x="21" y="4" width="7" height="17" rx="3.5" fill="currentColor" />
      </svg>
      {!compact && <span>fluid<span className="brand-light">tabs</span><span className="brand-period">.</span></span>}
    </span>
  );
}
