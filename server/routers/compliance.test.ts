import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

// Mock the db helpers BEFORE importing the router so the router picks up our
// stubs. Vitest hoists vi.mock calls automatically.
vi.mock("../db", () => ({
  listAllAuditEntriesForOrg: vi.fn(),
  listAllDealVersionsForOrg: vi.fn(),
  listDealsByOrg: vi.fn(),
  getOrgRow: vi.fn(),
}));

// Mock the trpc helpers — we don't want a real express request stack here.
// Instead, we exercise the underlying handler logic directly.
import { complianceRouter } from "./compliance";
import * as db from "../db";

const mocks = db as unknown as {
  listAllAuditEntriesForOrg: ReturnType<typeof vi.fn>;
  listAllDealVersionsForOrg: ReturnType<typeof vi.fn>;
  listDealsByOrg: ReturnType<typeof vi.fn>;
  getOrgRow: ReturnType<typeof vi.fn>;
};

function makeCallerCtx(role: "partner" | "analyst" | "observer") {
  return {
    user: { openId: `u-${role}`, name: `${role} user`, orgId: 1, role },
    req: {} as any,
    res: { cookie: () => {}, clearCookie: () => {} } as any,
  };
}

describe("compliance.exportArchive — Sprint B Gate B", () => {
  beforeEach(() => {
    mocks.listAllAuditEntriesForOrg.mockReset();
    mocks.listAllDealVersionsForOrg.mockReset();
    mocks.listDealsByOrg.mockReset();
    mocks.getOrgRow.mockReset();
  });

  it("partner can export — returns zip with all four artifacts", async () => {
    mocks.getOrgRow.mockResolvedValue({ id: 1, name: "Demo Org" });
    mocks.listAllAuditEntriesForOrg.mockResolvedValue([
      {
        id: 1,
        createdAt: new Date("2026-01-01T12:00:00Z"),
        actorOpenId: "u-partner",
        actorName: "Alice",
        action: "deal.create",
        targetType: "deal",
        targetId: "deal_demo_1",
        summary: 'Created "Demo Co"',
        diff: [{ field: "_created", before: null, after: { id: "deal_demo_1" } }],
      },
      {
        id: 2,
        createdAt: new Date("2026-02-01T12:00:00Z"),
        actorOpenId: "u-partner",
        actorName: "Alice",
        action: "deal.update",
        targetType: "deal",
        targetId: "deal_demo_1",
        summary: 'Updated "Demo Co"',
        diff: [{ field: "stage", before: "screening", after: "diligence" }],
      },
    ]);
    mocks.listAllDealVersionsForOrg.mockResolvedValue([
      {
        id: 11,
        dealId: "deal_demo_1",
        orgId: 1,
        version: 1,
        actorOpenId: "u-partner",
        reason: "create",
        createdAt: new Date("2026-01-01T12:00:00Z"),
        payload: { id: "deal_demo_1", companyName: "Demo Co", stage: "screening" },
      },
      {
        id: 12,
        dealId: "deal_demo_1",
        orgId: 1,
        version: 2,
        actorOpenId: "u-partner",
        reason: "update",
        createdAt: new Date("2026-02-01T12:00:00Z"),
        payload: { id: "deal_demo_1", companyName: "Demo Co", stage: "diligence" },
      },
    ]);
    mocks.listDealsByOrg.mockResolvedValue([
      {
        id: 1,
        dealId: "deal_demo_1",
        companyName: "Demo Co",
        industry: "SaaS",
        stage: "diligence",
        version: 2,
        payload: { id: "deal_demo_1", companyName: "Demo Co", stage: "diligence" },
        updatedAt: new Date("2026-02-01T12:00:00Z"),
      },
    ]);

    const caller = complianceRouter.createCaller(makeCallerCtx("partner") as any);
    const result = await caller.exportArchive({});

    expect(result.filename).toMatch(/^demo-org-compliance-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(result.counts).toEqual({ audit: 2, versions: 2, deals: 1 });
    expect(result.sizeBytes).toBeGreaterThan(100);

    // Decode and verify the four artifacts exist with sane content.
    const buf = Buffer.from(result.base64, "base64");
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["README.md", "audit_log.csv", "deal_versions.json", "deals_current.json"]);

    const csv = await zip.file("audit_log.csv")!.async("string");
    expect(csv).toMatch(/^id,createdAt,actorOpenId,actorName,actorEmail,action,targetType,targetId,summary,diff_json/);
    expect(csv).toContain("deal.create");
    expect(csv).toContain("deal.update");
    expect(csv).toContain("deal_demo_1");

    const versionsJson = JSON.parse(await zip.file("deal_versions.json")!.async("string"));
    expect(versionsJson).toHaveLength(2);
    expect(versionsJson[0].payload.id).toBe("deal_demo_1");

    const dealsJson = JSON.parse(await zip.file("deals_current.json")!.async("string"));
    expect(dealsJson).toHaveLength(1);
    expect(dealsJson[0].id).toBe("deal_demo_1");

    const readme = await zip.file("README.md")!.async("string");
    expect(readme).toContain("Demo Org");
    expect(readme).toContain("audit_log.csv");
    expect(readme).toContain("deal_versions.json");
    expect(readme).toContain("Reproducing the engine output");
  });

  it("analyst is blocked by middleware (FORBIDDEN)", async () => {
    const caller = complianceRouter.createCaller(makeCallerCtx("analyst") as any);
    await expect(caller.exportArchive({})).rejects.toThrow(/not permitted|FORBIDDEN/i);
  });

  it("observer is blocked by middleware (FORBIDDEN)", async () => {
    const caller = complianceRouter.createCaller(makeCallerCtx("observer") as any);
    await expect(caller.exportArchive({})).rejects.toThrow(/not permitted|FORBIDDEN/i);
  });

  it("CSV escapes quotes/commas/newlines in summary correctly", async () => {
    mocks.getOrgRow.mockResolvedValue({ id: 1, name: "Demo Org" });
    mocks.listAllAuditEntriesForOrg.mockResolvedValue([
      {
        id: 9,
        createdAt: new Date("2026-03-01T12:00:00Z"),
        actorOpenId: "u-partner",
        actorName: "Alice",
        action: "deal.create",
        targetType: "deal",
        targetId: "deal_x",
        summary: 'He said "hi", then\nleft.',
        diff: [],
      },
    ]);
    mocks.listAllDealVersionsForOrg.mockResolvedValue([]);
    mocks.listDealsByOrg.mockResolvedValue([]);

    const caller = complianceRouter.createCaller(makeCallerCtx("partner") as any);
    const result = await caller.exportArchive({});
    const zip = await JSZip.loadAsync(Buffer.from(result.base64, "base64"));
    const csv = await zip.file("audit_log.csv")!.async("string");
    // The escaped summary must be wrapped in quotes with quotes doubled.
    expect(csv).toContain('"He said ""hi"", then\nleft."');
  });
});
