export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-logo${compact ? " brand-logo-compact" : ""}`} aria-hidden="true">
      <img className="brand-logo-image" src="/zenaian-logo-transparent.png" alt="" />
    </span>
  );
}
