import { describe, expect, it, beforeEach } from "vitest";
import {
  LEGACY_DEALS_KEY,
  legacyMigrationCompleted,
  markLegacyMigrationCompleted,
  pendingLegacyDeals,
  readLegacyDeals,
} from "../store";
import type { DealInput } from "../types";

const sample = (id: string, name: string): DealInput => ({
  id,
  companyName: name,
  industry: "HVAC",
});

describe("Horizon 3 migration helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("readLegacyDeals returns [] when nothing is stored", () => {
    expect(readLegacyDeals()).toEqual([]);
  });

  it("readLegacyDeals parses the v2 localStorage payload", () => {
    const deals = [sample("deal-1", "Acme HVAC"), sample("deal-2", "Bravo Plumbing")];
    localStorage.setItem(LEGACY_DEALS_KEY, JSON.stringify(deals));
    expect(readLegacyDeals()).toHaveLength(2);
    expect(readLegacyDeals()[0].id).toBe("deal-1");
  });

  it("pendingLegacyDeals returns deals not yet on the server", () => {
    const legacy = [sample("deal-1", "Acme"), sample("deal-2", "Bravo"), sample("deal-3", "Charlie")];
    localStorage.setItem(LEGACY_DEALS_KEY, JSON.stringify(legacy));
    const server = [sample("deal-1", "Acme")];
    const pending = pendingLegacyDeals(server);
    expect(pending.map((d) => d.id)).toEqual(["deal-2", "deal-3"]);
  });

  it("pendingLegacyDeals returns [] when server already has them all", () => {
    const legacy = [sample("deal-1", "Acme"), sample("deal-2", "Bravo")];
    localStorage.setItem(LEGACY_DEALS_KEY, JSON.stringify(legacy));
    const server = legacy;
    expect(pendingLegacyDeals(server)).toEqual([]);
  });

  it("markLegacyMigrationCompleted sets the dismissal flag", () => {
    expect(legacyMigrationCompleted()).toBe(false);
    markLegacyMigrationCompleted();
    expect(legacyMigrationCompleted()).toBe(true);
  });

  it("malformed legacy payload yields [] and does not throw", () => {
    localStorage.setItem(LEGACY_DEALS_KEY, "{not-valid-json");
    expect(readLegacyDeals()).toEqual([]);
  });
});
