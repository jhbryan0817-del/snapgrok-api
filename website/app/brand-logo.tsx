export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-logo${compact ? " brand-logo-compact" : ""}`} aria-hidden="true">
      <img src="/zenaian-logo-full.png" alt="" />
    </span>
  );
}
