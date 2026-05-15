import { describe, it, expect } from "vitest";
import { can, normalizeRole, ROLE_PERMISSIONS, type Permission } from "./roles";

describe("roles permission map (Sprint B)", () => {
  describe("normalizeRole", () => {
    it("maps legacy admin -> partner and legacy user -> analyst", () => {
      expect(normalizeRole("admin")).toBe("partner");
      expect(normalizeRole("user")).toBe("analyst");
    });

    it("preserves canonical roles", () => {
      expect(normalizeRole("partner")).toBe("partner");
      expect(normalizeRole("analyst")).toBe("analyst");
      expect(normalizeRole("observer")).toBe("observer");
    });

    it("falls back to observer for null/undefined/garbage", () => {
      expect(normalizeRole(null)).toBe("observer");
      expect(normalizeRole(undefined)).toBe("observer");
      expect(normalizeRole("nonsense")).toBe("observer");
      expect(normalizeRole("")).toBe("observer");
    });
  });

  describe("can(role, perm) — Gate B contract", () => {
    // Gate B criterion: "Analyst account cannot click Send to IC"
    it("Analyst CANNOT send to IC, vote, approve LOI, override engine, restore, or export", () => {
      const denied: Permission[] = [
        "deal.send_to_ic",
        "deal.vote_ic",
        "deal.approve_loi",
        "deal.override_engine",
        "deal.restore_version",
        "deal.delete",
        "audit.view_org",
        "compliance.export",
      ];
      for (const p of denied) {
        expect(can("analyst", p), `analyst should NOT have ${p}`).toBe(false);
      }
    });

    it("Analyst CAN create and edit deals", () => {
      expect(can("analyst", "deal.create")).toBe(true);
      expect(can("analyst", "deal.edit")).toBe(true);
      expect(can("analyst", "deal.stage_change")).toBe(true);
      expect(can("analyst", "assumptions.edit")).toBe(true);
    });

    // Gate B criterion: "Observer cannot edit any field"
    it("Observer has ZERO write permissions", () => {
      const allPerms: Permission[] = [
        "deal.create",
        "deal.edit",
        "deal.delete",
        "deal.stage_change",
        "deal.send_to_ic",
        "deal.vote_ic",
        "deal.approve_loi",
        "deal.override_engine",
        "deal.restore_version",
        "assumptions.edit",
        "audit.view_org",
        "compliance.export",
      ];
      for (const p of allPerms) {
        expect(can("observer", p), `observer should NOT have ${p}`).toBe(false);
      }
      // After Sprint C Phase 1, observer gains notification.read for bell visibility (still read-only)
      expect(ROLE_PERMISSIONS.observer).toEqual(["notification.read"]);
    });

    it("Partner has every permission", () => {
      const allPerms: Permission[] = [
        "deal.create",
        "deal.edit",
        "deal.delete",
        "deal.stage_change",
        "deal.send_to_ic",
        "deal.vote_ic",
        "deal.approve_loi",
        "deal.override_engine",
        "deal.restore_version",
        "assumptions.edit",
        "audit.view_org",
        "compliance.export",
      ];
      for (const p of allPerms) {
        expect(can("partner", p), `partner should have ${p}`).toBe(true);
      }
    });

    it("compliance.export is partner-only", () => {
      expect(can("partner", "compliance.export")).toBe(true);
      expect(can("analyst", "compliance.export")).toBe(false);
      expect(can("observer", "compliance.export")).toBe(false);
    });

    it("audit.view_org is partner-only", () => {
      expect(can("partner", "audit.view_org")).toBe(true);
      expect(can("analyst", "audit.view_org")).toBe(false);
      expect(can("observer", "audit.view_org")).toBe(false);
    });

    it("legacy admin role grants partner perms", () => {
      expect(can("admin", "compliance.export")).toBe(true);
      expect(can("admin", "deal.approve_loi")).toBe(true);
    });
  });
});
