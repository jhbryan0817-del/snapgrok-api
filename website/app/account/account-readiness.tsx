"use client";

import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBillingStatus } from "../billing-status-context";
import {
  createExtensionPairing,
  ZENAIAN_EXTENSION_ID,
} from "../extension-api";

const EXTENSION_CHECK_TIMEOUT_MS = 3500;
const EXTENSION_CONNECT_TIMEOUT_MS = 20000;

type ExtensionState = "checking" | "connected" | "installed" | "missing";
type RuntimeResponse = {
  ok?: boolean;
  installed?: boolean;
  connected?: boolean;
  accountId?: string;
  nonce?: string;
  error?: string;
};
type ChromeRuntime = {
  lastError?: { message?: string };
  sendMessage: (
    extensionId: string,
    message: Record<string, unknown>,
    callback: (response?: RuntimeResponse) => void,
  ) => void;
};

export function AccountReadiness() {
  const { isLoaded: authLoaded, isSignedIn, userId, getToken } = useAuth();
  const { status, loading, error } = useBillingStatus();
  const [extensionState, setExtensionState] =
    useState<ExtensionState>("checking");
  const [connectionError, setConnectionError] = useState("");
  const checkInFlight = useRef(false);

  const checkExtension = useCallback(async () => {
    if (checkInFlight.current) return;
    checkInFlight.current = true;
    setExtensionState("checking");
    setConnectionError("");
    try {
      const ping = await sendExtensionMessage(
        { type: "SNEAKSOLVE_EXTENSION_PING" },
        EXTENSION_CHECK_TIMEOUT_MS,
      );
      if (!ping?.installed) {
        setExtensionState("missing");
        return;
      }
      if (!authLoaded || !isSignedIn || !userId) {
        setExtensionState("installed");
        return;
      }
      if (ping.connected && ping.accountId === userId) {
        setExtensionState("connected");
        return;
      }

      const nonceResponse = await sendExtensionMessage(
        { type: "SNEAKSOLVE_EXTENSION_PAIRING_NONCE_REQUEST" },
        EXTENSION_CHECK_TIMEOUT_MS,
      );
      if (!nonceResponse?.ok || !isPairingNonce(nonceResponse.nonce)) {
        throw new Error("The extension could not start a secure connection.");
      }
      const token = await getToken();
      if (!token) throw new Error("Please sign in again before connecting the extension.");
      const pairing = await createExtensionPairing(token, nonceResponse.nonce);
      const paired = await sendExtensionMessage(
        {
          type: "SNEAKSOLVE_EXTENSION_PAIR",
          pairingCode: pairing.pairingCode,
          nonce: nonceResponse.nonce,
        },
        EXTENSION_CONNECT_TIMEOUT_MS,
      );
      if (!paired?.ok || paired.connected !== true) {
        throw new Error("The extension did not accept the secure connection.");
      }
      setExtensionState("connected");
    } catch (connectionFailure) {
      const message =
        connectionFailure instanceof Error
          ? connectionFailure.message
          : "The extension connection could not be completed.";
      setConnectionError(message);
      setExtensionState("installed");
    } finally {
      checkInFlight.current = false;
    }
  }, [authLoaded, getToken, isSignedIn, userId]);

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
    connectionError,
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
  connectionError,
  status,
  loading,
  error,
}: {
  extensionState: ExtensionState;
  connectionError: string;
  status: ReturnType<typeof useBillingStatus>["status"];
  loading: boolean;
  error: string;
}) {
  if (extensionState === "checking") {
    return {
      tone: "checking",
      title: "Connecting your extension and checking your planâ€¦",
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

  if (extensionState === "installed") {
    return {
      tone: "blocked",
      title: "Extension access could not be connected",
      detail: connectionError || "Reopen the extension, then return to this tab.",
    } as const;
  }

  if (loading) {
    return {
      tone: "checking",
      title: "Checking your remaining questionsâ€¦",
      detail: "",
    } as const;
  }

  if (status?.billingEnabled && status.usage && status.usage.remaining <= 0) {
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

function sendExtensionMessage(
  message: Record<string, unknown>,
  timeoutMs: number,
): Promise<RuntimeResponse | undefined> {
  const runtime = (
    window as Window & { chrome?: { runtime?: ChromeRuntime } }
  ).chrome?.runtime;
  if (!runtime?.sendMessage) return Promise.resolve(undefined);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      callback();
    };
    const timeout = window.setTimeout(
      () => finish(() => reject(new Error("The extension did not respond in time."))),
      timeoutMs,
    );

    try {
      runtime.sendMessage(ZENAIAN_EXTENSION_ID, message, (response) => {
        const lastError = runtime.lastError;
        finish(() => {
          if (lastError) {
            reject(new Error(lastError.message || "The extension is not available."));
          } else {
            resolve(response);
          }
        });
      });
    } catch (messageError) {
      finish(() => reject(messageError));
    }
  });
}

function isPairingNonce(value: unknown): value is string {
  return /^[A-Za-z0-9_-]{43}$/.test(String(value || ""));
}
