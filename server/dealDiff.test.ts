import { describe, expect, it } from "vitest";
import { computeDealDiff } from "./db";

describe("computeDealDiff", () => {
  it("treats null before as full creation diff", () => {
    const diff = computeDealDiff(null, { companyName: "Acme", askingPrice: 1_000_000 });
    expect(diff).toHaveLength(2);
    expect(diff.find((d) => d.field === "companyName")).toMatchObject({
      before: null,
      after: "Acme",
    });
    expect(diff.find((d) => d.field === "askingPrice")).toMatchObject({
      before: null,
      after: 1_000_000,
    });
  });

  it("returns an empty diff when payloads are identical", () => {
    const before = { companyName: "Acme", askingPrice: 1_000_000 };
    const after = { companyName: "Acme", askingPrice: 1_000_000 };
    expect(computeDealDiff(before, after)).toEqual([]);
  });

  it("captures changed fields only", () => {
    const before = { companyName: "Acme", askingPrice: 1_000_000, stage: "LOI Submitted" };
    const after = { companyName: "Acme", askingPrice: 1_250_000, stage: "Diligence" };
    const diff = computeDealDiff(before, after);
    expect(diff.map((d) => d.field).sort()).toEqual(["askingPrice", "stage"]);
  });

  it("captures removed fields", () => {
    const before = { companyName: "Acme", askingPrice: 1_000_000 };
    const after = { companyName: "Acme" };
    const diff = computeDealDiff(before, after);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ field: "askingPrice", before: 1_000_000, after: null });
  });

  it("does deep equality on nested objects (workingCapital)", () => {
    const before = { workingCapital: { dso: 45, dpo: 30 } };
    const after = { workingCapital: { dso: 45, dpo: 30 } };
    expect(computeDealDiff(before, after)).toEqual([]);
  });

  it("flags nested change when sub-field differs", () => {
    const before = { workingCapital: { dso: 45, dpo: 30 } };
    const after = { workingCapital: { dso: 50, dpo: 30 } };
    const diff = computeDealDiff(before, after);
    expect(diff).toHaveLength(1);
    expect(diff[0].field).toBe("workingCapital");
  });
});
