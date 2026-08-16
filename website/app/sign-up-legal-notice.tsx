import Link from "next/link";

export function SignUpLegalNotice() {
  return (
    <p className="signup-legal-notice">
      By creating an account, you confirm you are at least 19 and agree to the{" "}
      <Link href="/terms" target="_blank">Terms of Service</Link> and{" "}
      <Link href="/privacy" target="_blank">Privacy Policy</Link>.
    </p>
  );
}
