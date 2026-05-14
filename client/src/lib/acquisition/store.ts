// Deal repository + capital stack assumptions store.
//
// Everything lives in localStorage so the deterministic engine has a single
// source of truth without needing a backend. The store is consumed via the
// useDealStore hook (React) but is exported as plain functions too so tests
// and exports can use it.

import { useEffect, useState, useCallback, useMemo } from "react";
import type { CapitalStackAssumptions, DealInput } from "./types";
import { DEFAULT_ASSUMPTIONS } from "./dealMath";
import { DEMO_DEALS, REQUIRED_TEST_CASES } from "./seedDeals";

const DEALS_KEY = "acq-os.deals.v2";
const ASSUMP_KEY = "acq-os.assumptions.v2";
const INIT_KEY = "acq-os.initialized.v2";
const ACTIVE_DEAL_KEY = "acq-os.activeDealId.v2";
const SAVED_AT_KEY = "acq-os.lastSavedAt.v2";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadDealsFromStorage(): DealInput[] {
  if (typeof window === "undefined") return [];
  return safeParse<DealInput[]>(localStorage.getItem(DEALS_KEY), []);
}

function saveDealsToStorage(deals: DealInput[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEALS_KEY, JSON.stringify(deals));
  localStorage.setItem(SAVED_AT_KEY, String(Date.now()));
}

function loadAssumptionsFromStorage(): CapitalStackAssumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  return safeParse<CapitalStackAssumptions>(
    localStorage.getItem(ASSUMP_KEY),
    DEFAULT_ASSUMPTIONS,
  );
}

function saveAssumptionsToStorage(a: CapitalStackAssumptions) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ASSUMP_KEY, JSON.stringify(a));
  localStorage.setItem(SAVED_AT_KEY, String(Date.now()));
}

function loadActiveDealId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_DEAL_KEY);
}

function saveActiveDealId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id === null) localStorage.removeItem(ACTIVE_DEAL_KEY);
  else localStorage.setItem(ACTIVE_DEAL_KEY, id);
}

function loadLastSavedAt(): number | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(SAVED_AT_KEY);
  return v ? Number(v) : null;
}

function ensureSeeded(): DealInput[] {
  if (typeof window === "undefined") return [];
  const initialized = localStorage.getItem(INIT_KEY);
  if (initialized) return loadDealsFromStorage();
  const seeded = [...DEMO_DEALS, ...REQUIRED_TEST_CASES];
  saveDealsToStorage(seeded);
  localStorage.setItem(INIT_KEY, "1");
  return seeded;
}

const subscribers = new Set<() => void>();
function notify() {
  subscribers.forEach((fn) => fn());
}

export function useDealStore() {
  const [deals, setDeals] = useState<DealInput[]>(() => ensureSeeded());
  const [assumptions, setAssumptionsState] = useState<CapitalStackAssumptions>(
    () => loadAssumptionsFromStorage(),
  );
  const [activeDealId, setActiveDealIdState] = useState<string | null>(() => loadActiveDealId());
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() => loadLastSavedAt());

  useEffect(() => {
    const fn = () => {
      setDeals(loadDealsFromStorage());
      setAssumptionsState(loadAssumptionsFromStorage());
      setActiveDealIdState(loadActiveDealId());
      setLastSavedAt(loadLastSavedAt());
    };
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  const upsertDeal = useCallback((deal: DealInput) => {
    setDeals((curr) => {
      const id = deal.id ?? `deal-${Date.now()}`;
      const dealWithId = { ...deal, id };
      const next = curr.some((d) => d.id === id)
        ? curr.map((d) => (d.id === id ? { ...d, ...dealWithId } : d))
        : [...curr, dealWithId];
      saveDealsToStorage(next);
      notify();
      return next;
    });
  }, []);

  const removeDeal = useCallback((id: string) => {
    setDeals((curr) => {
      const next = curr.filter((d) => d.id !== id);
      saveDealsToStorage(next);
      // Clear active selection if it was removed.
      if (loadActiveDealId() === id) saveActiveDealId(null);
      notify();
      return next;
    });
  }, []);

  const setAssumptions = useCallback((a: CapitalStackAssumptions) => {
    saveAssumptionsToStorage(a);
    setAssumptionsState(a);
    notify();
  }, []);

  const resetAssumptions = useCallback(() => {
    saveAssumptionsToStorage(DEFAULT_ASSUMPTIONS);
    setAssumptionsState(DEFAULT_ASSUMPTIONS);
    notify();
  }, []);

  const resetSeed = useCallback(() => {
    const seeded = [...DEMO_DEALS, ...REQUIRED_TEST_CASES];
    saveDealsToStorage(seeded);
    setDeals(seeded);
    notify();
  }, []);

  const setActiveDealId = useCallback((id: string | null) => {
    saveActiveDealId(id);
    setActiveDealIdState(id);
    notify();
  }, []);

  const liveDeals = useMemo(
    () => deals.filter((d) => !d.isDemo && !d.isTest),
    [deals],
  );
  const demoDeals = useMemo(() => deals.filter((d) => d.isDemo), [deals]);
  const testDeals = useMemo(() => deals.filter((d) => d.isTest), [deals]);

  // Resolve the active deal: explicit selection if present and still in store,
  // else first live deal, else first demo deal, else first deal.
  const activeDeal = useMemo<DealInput | null>(() => {
    if (activeDealId) {
      const found = deals.find((d) => d.id === activeDealId);
      if (found) return found;
    }
    if (liveDeals[0]) return liveDeals[0];
    if (demoDeals[0]) return demoDeals[0];
    return deals[0] ?? null;
  }, [activeDealId, deals, liveDeals, demoDeals]);

  return {
    deals,
    liveDeals,
    demoDeals,
    testDeals,
    assumptions,
    upsertDeal,
    removeDeal,
    setAssumptions,
    resetAssumptions,
    resetSeed,
    activeDealId,
    setActiveDealId,
    activeDeal,
    lastSavedAt,
  };
}
