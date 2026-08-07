"use client";

import { useAuth } from "@clerk/react";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BillingApiError,
  BillingStatus,
  getBillingStatus,
} from "./billing-api";

type BillingStatusContextValue = {
  status: BillingStatus | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const BillingStatusContext = createContext<BillingStatusContextValue | null>(
  null,
);

export function BillingStatusProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStatus = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        const token = await getToken({ skipCache: true });
        if (!token) throw new Error("missing session token");
        setStatus(await getBillingStatus(token));
        setError("");
      } catch (loadError) {
        setError(
          loadError instanceof BillingApiError
            ? loadError.message
            : "Plan status could not be loaded. Please refresh this page.",
        );
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [getToken],
  );

  const refresh = useCallback(
    async () => loadStatus(true),
    [loadStatus],
  );

  useEffect(() => {
    void loadStatus(true);

    const billingReturn =
      new URLSearchParams(window.location.search).get("billing") === "return";
    if (!billingReturn) return;

    const retries = [1500, 3500, 7000].map((delay) =>
      window.setTimeout(() => void loadStatus(false), delay),
    );
    return () => retries.forEach((timer) => window.clearTimeout(timer));
  }, [loadStatus]);

  const value = useMemo(
    () => ({ status, loading, error, refresh }),
    [status, loading, error, refresh],
  );

  return (
    <BillingStatusContext.Provider value={value}>
      {children}
    </BillingStatusContext.Provider>
  );
}

export function useBillingStatus(): BillingStatusContextValue {
  const value = useContext(BillingStatusContext);
  if (!value) {
    throw new Error(
      "useBillingStatus must be used inside BillingStatusProvider.",
    );
  }
  return value;
}
