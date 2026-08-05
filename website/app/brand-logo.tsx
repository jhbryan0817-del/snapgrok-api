export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-logo${compact ? " brand-logo-compact" : ""}`} aria-hidden="true">
      <img className="brand-logo-icon" src="/zenaian-favicon.png" alt="" />
      <span className="brand-logo-wordmark">
        <img src="/zenaian-logo-full.png" alt="" />
      </span>
    </span>
  );
}
