// Acquisition OS — server-backed deal store (Horizon 3).
//
// Persistence model:
//   - Server (MySQL via tRPC) is the single source of truth in production.
//   - localStorage is used ONLY as a transient hydration cache so the UI
//     paints instantly on reload while the server fetch completes. It is
//     overwritten by every server response and is never authoritative.
//   - Demo + required test deals are seeded ONCE per user on first server
//     hydration if the org is empty.
//   - Every mutation goes through tRPC; the audit log + version table are
//     written server-side. Optimistic local updates make the UI feel snappy.
//
// This module preserves the exact return shape of the previous useDealStore
// hook so the deterministic engine (174 deterministic tests) keeps working.

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type { CapitalStackAssumptions, DealInput } from "./types";
import { DEFAULT_ASSUMPTIONS } from "./dealMath";
import { DEMO_DEALS, REQUIRED_TEST_CASES } from "./seedDeals";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// Cache keys are versioned so a release can invalidate stale shapes.
const DEALS_CACHE_KEY = "acq-os.deals.cache.v3";
const ASSUMP_CACHE_KEY = "acq-os.assumptions.cache.v3";
const ACTIVE_CACHE_KEY = "acq-os.activeDealId.cache.v3";
const SAVED_AT_KEY = "acq-os.lastSavedAt.v3";
// Legacy v2 keys we read once for migration.
export const LEGACY_DEALS_KEY = "acq-os.deals.v2";
export const LEGACY_ASSUMP_KEY = "acq-os.assumptions.v2";
const MIGRATION_DONE_KEY = "acq-os.migrationCompleted.v3";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readCache<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return safeParse<T>(localStorage.getItem(key), fallback);
}

function writeCache(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(SAVED_AT_KEY, String(Date.now()));
  } catch {
    // quota / private mode — silently ignore.
  }
}

// ---------------------------------------------------------------------------
// Migration helpers — exposed for the one-time migration UI.
// ---------------------------------------------------------------------------

/** Reads the legacy v2 localStorage deals (the pre-Horizon-3 format). */
export function readLegacyDeals(): DealInput[] {
  if (typeof window === "undefined") return [];
  return safeParse<DealInput[]>(localStorage.getItem(LEGACY_DEALS_KEY), []);
}

export function legacyMigrationCompleted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MIGRATION_DONE_KEY) === "1";
}

export function markLegacyMigrationCompleted() {
  if (typeof window === "undefined") return;
  localStorage.setItem(MIGRATION_DONE_KEY, "1");
}

/** Returns the legacy-localStorage deals NOT already present on the server. */
export function pendingLegacyDeals(serverDeals: DealInput[]): DealInput[] {
  const have = new Set(serverDeals.map((d) => d.id).filter(Boolean));
  return readLegacyDeals().filter((d) => !d.id || !have.has(d.id));
}

// ---------------------------------------------------------------------------
// useDealStore — server-backed
// ---------------------------------------------------------------------------

export function useDealStore() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  // Server queries — only fire when authenticated.
  const dealsQuery = trpc.deals.list.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 5_000,
  });
  const orgStateQuery = trpc.deals.getOrgState.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 5_000,
  });

  // Mutations
  const upsertMut = trpc.deals.upsert.useMutation({
    onSuccess: () => utils.deals.list.invalidate(),
  });
  const removeMut = trpc.deals.remove.useMutation({
    onSuccess: () => utils.deals.list.invalidate(),
  });
  const setAssumpMut = trpc.deals.setAssumptions.useMutation({
    onSuccess: () => utils.deals.getOrgState.invalidate(),
  });
  const setActiveMut = trpc.deals.setActiveDealId.useMutation({
    onSuccess: () => utils.deals.getOrgState.invalidate(),
  });
  const bulkImportMut = trpc.deals.bulkImport.useMutation({
    onSuccess: () => utils.deals.list.invalidate(),
  });

  // Hydrate-from-cache snapshot for first paint, replaced as soon as the
  // server query resolves.
  const cachedDeals = useMemo<DealInput[]>(() => readCache(DEALS_CACHE_KEY, []), []);
  const cachedAssumptions = useMemo<CapitalStackAssumptions>(
    () => readCache(ASSUMP_CACHE_KEY, DEFAULT_ASSUMPTIONS),
    [],
  );
  const cachedActive = useMemo<string | null>(() => readCache(ACTIVE_CACHE_KEY, null), []);

  // Local optimistic mirror.
  const [localDeals, setLocalDeals] = useState<DealInput[]>(cachedDeals);
  const [localAssumptions, setLocalAssumptions] = useState<CapitalStackAssumptions>(cachedAssumptions);
  const [localActive, setLocalActive] = useState<string | null>(cachedActive);

  // Sync server → local on every successful query.
  useEffect(() => {
    if (dealsQuery.data) {
      const data = dealsQuery.data as DealInput[];
      setLocalDeals(data);
      writeCache(DEALS_CACHE_KEY, data);
    }
  }, [dealsQuery.data]);

  useEffect(() => {
    if (orgStateQuery.data) {
      const a = (orgStateQuery.data.assumptions as CapitalStackAssumptions | null) ?? DEFAULT_ASSUMPTIONS;
      const id = orgStateQuery.data.activeDealId ?? null;
      setLocalAssumptions(a);
      setLocalActive(id);
      writeCache(ASSUMP_CACHE_KEY, a);
      writeCache(ACTIVE_CACHE_KEY, id);
    }
  }, [orgStateQuery.data]);

  // First-load auto-seed: if the user is authed, server returned an empty
  // list AND no migration is pending, push the demo+required test deals so
  // the test suite + dashboard surfaces have something to render.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (seededRef.current) return;
    if (!dealsQuery.isFetched) return;
    const serverDeals = (dealsQuery.data as DealInput[] | undefined) ?? [];
    if (serverDeals.length > 0) {
      seededRef.current = true;
      return;
    }
    if (pendingLegacyDeals(serverDeals).length > 0) {
      // Don't auto-seed if the user has legacy deals to migrate; the UI will
      // prompt them.
      return;
    }
    seededRef.current = true;
    const seeds = [...DEMO_DEALS, ...REQUIRED_TEST_CASES];
    bulkImportMut.mutate({ deals: seeds as unknown as Record<string, unknown>[] });
  }, [isAuthenticated, dealsQuery.isFetched, dealsQuery.data, bulkImportMut]);

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const upsertDeal = useCallback(
    (deal: DealInput) => {
      // Optimistic local update.
      const id = deal.id ?? `deal-${Date.now()}`;
      const next = { ...deal, id };
      setLocalDeals((curr) => {
        const exists = curr.some((d) => d.id === id);
        const merged = exists
          ? curr.map((d) => (d.id === id ? { ...d, ...next } : d))
          : [...curr, next];
        writeCache(DEALS_CACHE_KEY, merged);
        return merged;
      });
      // Persist to server.
      upsertMut.mutate({
        dealId: id,
        payload: next as unknown as Record<string, unknown>,
        reason: deal.id ? "edit" : "create",
      });
    },
    [upsertMut],
  );

  const removeDeal = useCallback(
    (id: string) => {
      setLocalDeals((curr) => {
        const next = curr.filter((d) => d.id !== id);
        writeCache(DEALS_CACHE_KEY, next);
        return next;
      });
      if (localActive === id) setLocalActive(null);
      removeMut.mutate({ dealId: id });
    },
    [removeMut, localActive],
  );

  const setAssumptions = useCallback(
    (a: CapitalStackAssumptions) => {
      setLocalAssumptions(a);
      writeCache(ASSUMP_CACHE_KEY, a);
      setAssumpMut.mutate({ assumptions: a as unknown as Record<string, unknown> });
    },
    [setAssumpMut],
  );

  const resetAssumptions = useCallback(() => {
    setAssumptions(DEFAULT_ASSUMPTIONS);
  }, [setAssumptions]);

  const setActiveDealId = useCallback(
    (id: string | null) => {
      setLocalActive(id);
      writeCache(ACTIVE_CACHE_KEY, id);
      setActiveMut.mutate({ dealId: id });
    },
    [setActiveMut],
  );

  const resetSeed = useCallback(() => {
    const seeds = [...DEMO_DEALS, ...REQUIRED_TEST_CASES];
    bulkImportMut.mutate({ deals: seeds as unknown as Record<string, unknown>[] });
  }, [bulkImportMut]);

  // Derived collections — preserved API.
  const liveDeals = useMemo(
    () => localDeals.filter((d) => !d.isDemo && !d.isTest),
    [localDeals],
  );
  const demoDeals = useMemo(() => localDeals.filter((d) => d.isDemo), [localDeals]);
  const testDeals = useMemo(() => localDeals.filter((d) => d.isTest), [localDeals]);

  const activeDeal = useMemo<DealInput | null>(() => {
    if (localActive) {
      const found = localDeals.find((d) => d.id === localActive);
      if (found) return found;
    }
    if (liveDeals[0]) return liveDeals[0];
    if (demoDeals[0]) return demoDeals[0];
    return localDeals[0] ?? null;
  }, [localActive, localDeals, liveDeals, demoDeals]);

  const lastSavedAt = useMemo<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(SAVED_AT_KEY);
    return v ? Number(v) : null;
  }, [localDeals, localAssumptions]);

  return {
    deals: localDeals,
    liveDeals,
    demoDeals,
    testDeals,
    assumptions: localAssumptions,
    upsertDeal,
    removeDeal,
    setAssumptions,
    resetAssumptions,
    resetSeed,
    activeDealId: localActive,
    setActiveDealId,
    activeDeal,
    lastSavedAt,
    // Server / sync state for status indicators
    isLoading: dealsQuery.isLoading || orgStateQuery.isLoading,
    isFetching: dealsQuery.isFetching || orgStateQuery.isFetching,
    isAuthenticated,
  };
}
