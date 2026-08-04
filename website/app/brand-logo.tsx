export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`brand-logo${compact ? " brand-logo-compact" : ""}`}
      role="img"
      aria-label="Zenaian"
    >
      <span className="brand-logo-black">zen</span>
      <span className="brand-logo-ai">
        <span className="brand-logo-a" aria-hidden="true">
          <span className="brand-logo-a-dots"><i /><i /><i /></span>
        </span>
        <span aria-hidden="true">i</span>
      </span>
      <span className="brand-logo-black">an</span>
    </span>
  );
}
