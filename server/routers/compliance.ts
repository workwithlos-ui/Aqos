import JSZip from "jszip";
import { z } from "zod";
import {
  getOrgRow,
  listAllAuditEntriesForOrg,
  listAllDealVersionsForOrg,
  listDealsByOrg,
} from "../db";
import type { TrpcContext } from "../_core/context";
import { permissionProcedure, router } from "../_core/trpc";

function orgIdFromCtx(ctx: TrpcContext): number {
  return (ctx.user as unknown as { orgId?: number })?.orgId ?? 1;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const AUDIT_CSV_HEADERS = [
  "id",
  "createdAt",
  "actorOpenId",
  "actorName",
  "actorEmail",
  "action",
  "targetType",
  "targetId",
  "summary",
  "diff_json",
];

function readmeContents(orgName: string, range: { from: string; to: string }, counts: { audit: number; versions: number; deals: number }) {
  return [
    `# Acquisition OS — Compliance Export`,
    ``,
    `Organization: ${orgName}`,
    `Date range: ${range.from} → ${range.to}`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `## Files`,
    ``,
    `### audit_log.csv`,
    `Append-only record of every mutation. ${counts.audit} entries.`,
    ``,
    `Columns:`,
    `- id — internal surrogate key`,
    `- createdAt — UTC ISO timestamp`,
    `- actorOpenId — Manus OAuth subject of the user who performed the action`,
    `- actorName / actorEmail — denormalized snapshot of the actor at write time`,
    `- action — one of: deal.create, deal.update, deal.delete, migration.import`,
    `- targetType — typically "deal"`,
    `- targetId — public deal id (DealInput.id)`,
    `- summary — human-readable one-line summary`,
    `- diff_json — JSON array of {field, before, after} entries describing the change`,
    ``,
    `### deal_versions.json`,
    `Full point-in-time snapshots of every deal across all versions. ${counts.versions} snapshots.`,
    ``,
    `Each entry contains:`,
    `- id, dealId, orgId, version, payload (full DealInput), actorOpenId, reason, createdAt`,
    `- payload is the verbatim DealInput JSON used by the deterministic engine`,
    ``,
    `### deals_current.json`,
    `Snapshot of deal state at export time. ${counts.deals} deals.`,
    ``,
    `## Reproducing the engine output`,
    ``,
    `Each deal_versions.payload is the input to the deterministic scoring engine in client/src/lib/acquisition/. Re-running analyzeDeal(payload) on any historical snapshot reproduces the exact verdict that was rendered at that point in time.`,
    ``,
    `## Schema notes`,
    ``,
    `- All timestamps are UTC.`,
    `- diff_json captures only fields that changed between consecutive versions; nested objects are captured as a single entry whose before/after are the full subtree.`,
    `- audit_log is append-only — there is no UPDATE or DELETE path.`,
    ``,
  ].join("\n");
}

export const complianceRouter = router({
  // Export the full org archive as a base64-encoded zip the client can save.
  exportArchive: permissionProcedure("compliance.export")
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      const orgId = orgIdFromCtx(ctx);
      const [audit, versions, currentDeals, org] = await Promise.all([
        listAllAuditEntriesForOrg(orgId),
        listAllDealVersionsForOrg(orgId),
        listDealsByOrg(orgId),
        getOrgRow(orgId),
      ]);

      const zip = new JSZip();

      // audit_log.csv
      const csvRows: string[] = [AUDIT_CSV_HEADERS.join(",")];
      for (const a of audit) {
        csvRows.push(
          [
            a.id,
            a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
            a.actorOpenId,
            a.actorName ?? "",
            "",
            a.action,
            a.targetType,
            a.targetId,
            a.summary ?? "",
            JSON.stringify(a.diff ?? []),
          ]
            .map(csvEscape)
            .join(","),
        );
      }
      zip.file("audit_log.csv", csvRows.join("\n"));

      // deal_versions.json
      zip.file(
        "deal_versions.json",
        JSON.stringify(
          versions.map((v) => ({
            id: v.id,
            dealId: v.dealId,
            orgId: v.orgId,
            version: v.version,
            actorOpenId: v.actorOpenId,
            reason: v.reason,
            createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
            payload: v.payload,
          })),
          null,
          2,
        ),
      );

      // deals_current.json
      zip.file(
        "deals_current.json",
        JSON.stringify(
          currentDeals.map((d) => ({
            id: d.dealId,
            companyName: d.companyName,
            industry: d.industry,
            stage: d.stage,
            version: d.version,
            payload: d.payload,
            updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt,
          })),
          null,
          2,
        ),
      );

      // README.md
      const dates = audit
        .map((a) => (a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt as unknown as string)))
        .filter((d) => !isNaN(d.getTime()));
      const range = {
        from: dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))).toISOString() : "—",
        to: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString() : "—",
      };
      zip.file(
        "README.md",
        readmeContents(org?.name ?? "Acquisition OS", range, {
          audit: audit.length,
          versions: versions.length,
          deals: currentDeals.length,
        }),
      );

      const buf = await zip.generateAsync({ type: "uint8array" });
      const base64 = Buffer.from(buf).toString("base64");
      const slug = (org?.name ?? "acquisition-os").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const today = new Date().toISOString().slice(0, 10);
      const filename = `${slug}-compliance-${today}.zip`;
      return {
        filename,
        base64,
        sizeBytes: buf.length,
        counts: { audit: audit.length, versions: versions.length, deals: currentDeals.length },
        range,
      };
    }),
});
