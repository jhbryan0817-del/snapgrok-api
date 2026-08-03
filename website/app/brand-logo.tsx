export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-name${className ? ` ${className}` : ""}`} aria-label="Zenaian">
      <span aria-hidden="true">zen<span className="brand-name-ai">ai</span>an</span>
    </span>
  );
}

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <BrandName className={`brand-logo${compact ? " brand-logo-compact" : ""}`} />;
}
