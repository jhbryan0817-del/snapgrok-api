"use client";

import { useCallback, useEffect, useState } from "react";
import { useBillingStatus } from "../billing-status-context";

const EXTENSION_ID = "pjfanaeopegobidkbpnlmeegmkmnabmk";
const EXTENSION_PING = "SNEAKSOLVE_EXTENSION_PING";
const EXTENSION_CHECK_TIMEOUT_MS = 2500;

type ExtensionState = "checking" | "installed" | "missing";
type RuntimeResponse = { installed?: boolean };
type ChromeRuntime = {
  lastError?: unknown;
  sendMessage: (
    extensionId: string,
    message: { type: string },
    callback: (response?: RuntimeResponse) => void,
  ) => void;
};

export function AccountReadiness() {
  const { status, loading, error } = useBillingStatus();
  const [extensionState, setExtensionState] =
    useState<ExtensionState>("checking");

  const checkExtension = useCallback(async () => {
    setExtensionState("checking");
    setExtensionState(
      (await detectSneakSolveExtension()) ? "installed" : "missing",
    );
  }, []);

  useEffect(() => {
    void checkExtension();

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkExtension();
    };
    window.addEventListener("focus", checkExtension);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.removeEventListener("focus", checkExtension);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [checkExtension]);

  const readiness = resolveReadiness({
    extensionState,
    status,
    loading,
    error,
  });

  return (
    <div
      className={`account-status-card account-status-${readiness.tone}`}
      aria-live="polite"
    >
      <span className="account-status-dot" aria-hidden="true" />
      <div>
        <strong>{readiness.title}</strong>
        {readiness.detail ? <p>{readiness.detail}</p> : null}
      </div>
    </div>
  );
}

function resolveReadiness({
  extensionState,
  status,
  loading,
  error,
}: {
  extensionState: ExtensionState;
  status: ReturnType<typeof useBillingStatus>["status"];
  loading: boolean;
  error: string;
}) {
  if (extensionState === "checking") {
    return {
      tone: "checking",
      title: "Checking your extension and plan…",
      detail: "",
    } as const;
  }

  if (extensionState === "missing") {
    return {
      tone: "blocked",
      title: "Please download the extension",
      detail: "After installing it, return to this tab to check again.",
    } as const;
  }

  if (loading) {
    return {
      tone: "checking",
      title: "Checking your remaining questions…",
      detail: "",
    } as const;
  }

  if (
    status?.billingEnabled &&
    status.usage &&
    status.usage.remaining <= 0
  ) {
    return {
      tone: "blocked",
      title: "Please upgrade your plan or wait until the next reset",
      detail: "",
    } as const;
  }

  const accessConfirmed =
    Boolean(status && !status.billingEnabled) ||
    Boolean(status?.billingEnabled && status.plan && status.usage);

  if (accessConfirmed) {
    return {
      tone: "ready",
      title: "Ready. Make sure that your extension is pinned",
      detail: "",
    } as const;
  }

  return {
    tone: "checking",
    title: "Account status could not be confirmed",
    detail: error || "Use the plan refresh button below to try again.",
  } as const;
}

function detectSneakSolveExtension(): Promise<boolean> {
  const runtime = (
    window as Window & { chrome?: { runtime?: ChromeRuntime } }
  ).chrome?.runtime;
  if (!runtime?.sendMessage) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (installed: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(installed);
    };
    const timeout = window.setTimeout(
      () => finish(false),
      EXTENSION_CHECK_TIMEOUT_MS,
    );

    try {
      runtime.sendMessage(
        EXTENSION_ID,
        { type: EXTENSION_PING },
        (response) => {
          const lastError = runtime.lastError;
          finish(!lastError && response?.installed === true);
        },
      );
    } catch {
      finish(false);
    }
  });
}
