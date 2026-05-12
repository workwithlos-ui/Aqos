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

  useEffect(() => {
    const fn = () => {
      setDeals(loadDealsFromStorage());
      setAssumptionsState(loadAssumptionsFromStorage());
    };
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  const upsertDeal = useCallback((deal: DealInput) => {
    setDeals((curr) => {
      const next = deal.id
        ? curr.some((d) => d.id === deal.id)
          ? curr.map((d) => (d.id === deal.id ? { ...d, ...deal } : d))
          : [...curr, deal]
        : [...curr, { ...deal, id: `deal-${Date.now()}` }];
      saveDealsToStorage(next);
      notify();
      return next;
    });
  }, []);

  const removeDeal = useCallback((id: string) => {
    setDeals((curr) => {
      const next = curr.filter((d) => d.id !== id);
      saveDealsToStorage(next);
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

  const liveDeals = useMemo(
    () => deals.filter((d) => !d.isDemo && !d.isTest),
    [deals],
  );
  const demoDeals = useMemo(() => deals.filter((d) => d.isDemo), [deals]);
  const testDeals = useMemo(() => deals.filter((d) => d.isTest), [deals]);

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
  };
}
