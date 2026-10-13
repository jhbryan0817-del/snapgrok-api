"use client";

import { RecoveryPage } from "./recovery-page";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RecoveryPage label="PLEASE TRY AGAIN" title="This page couldn’t load" detail="Please try again in a moment. If the problem continues, contact Zenaian support." onRetry={reset} />;
}
