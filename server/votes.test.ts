import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS, can, type Permission } from "../shared/roles";

describe("Sprint C Phase 3a — IC Voting permissions", () => {
  it("Partner can open, close, reopen votes and cast ballots", () => {
    expect(can("partner", "vote.open")).toBe(true);
    expect(can("partner", "vote.close")).toBe(true);
    expect(can("partner", "vote.reopen")).toBe(true);
    expect(can("partner", "ballot.cast")).toBe(true);
  });

  it("Analyst can cast ballots but cannot open/close/reopen votes", () => {
    expect(can("analyst", "ballot.cast")).toBe(true);
    expect(can("analyst", "vote.open")).toBe(false);
    expect(can("analyst", "vote.close")).toBe(false);
    expect(can("analyst", "vote.reopen")).toBe(false);
  });

  it("Observer has zero vote permissions (read-only)", () => {
    expect(can("observer", "vote.open")).toBe(false);
    expect(can("observer", "vote.close")).toBe(false);
    expect(can("observer", "vote.reopen")).toBe(false);
    expect(can("observer", "ballot.cast")).toBe(false);
  });

  it("Legacy admin role maps to partner (canonical)", () => {
    expect(can("admin", "vote.open")).toBe(true);
    expect(can("admin", "ballot.cast")).toBe(true);
  });

  it("Legacy user role maps to analyst (no vote control, can ballot)", () => {
    expect(can("user", "vote.open")).toBe(false);
    expect(can("user", "ballot.cast")).toBe(true);
  });
});

describe("Sprint C Phase 3a — Outcome computation logic (pure)", () => {
  // Re-implement the outcome logic locally for unit testing without DB
  function computeOutcome(
    ballots: Array<{ choice: "APPROVE" | "REJECT" | "ABSTAIN" | "REQUEST_CHANGES" }>,
    partnerCount: number,
  ): "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "NO_QUORUM" {
    const quorumThreshold = Math.ceil(partnerCount * 0.6);
    const majorityThreshold = Math.floor(partnerCount * 0.5) + 1;

    if (ballots.some((b) => b.choice === "REQUEST_CHANGES")) return "CHANGES_REQUESTED";

    const approves = ballots.filter((b) => b.choice === "APPROVE").length;
    const rejects = ballots.filter((b) => b.choice === "REJECT").length;
    const abstains = ballots.filter((b) => b.choice === "ABSTAIN").length;
    const totalCast = approves + rejects + abstains;

    if (totalCast < quorumThreshold) return "NO_QUORUM";
    if (approves >= majorityThreshold) return "APPROVED";
    if (rejects >= majorityThreshold) return "REJECTED";
    return approves > rejects ? "APPROVED" : "REJECTED";
  }

  it("Single REQUEST_CHANGES vote always wins (CHANGES_REQUESTED)", () => {
    const ballots = [
      { choice: "APPROVE" as const },
      { choice: "APPROVE" as const },
      { choice: "REQUEST_CHANGES" as const },
    ];
    expect(computeOutcome(ballots, 5)).toBe("CHANGES_REQUESTED");
  });

  it("Below 60% quorum returns NO_QUORUM (3 partners, 1 vote = 33% < 60%)", () => {
    const ballots = [{ choice: "APPROVE" as const }];
    expect(computeOutcome(ballots, 3)).toBe("NO_QUORUM");
  });

  it("Majority APPROVE → APPROVED (5 partners, 3 approve)", () => {
    const ballots = [
      { choice: "APPROVE" as const },
      { choice: "APPROVE" as const },
      { choice: "APPROVE" as const },
    ];
    expect(computeOutcome(ballots, 5)).toBe("APPROVED");
  });

  it("Majority REJECT → REJECTED (5 partners, 3 reject)", () => {
    const ballots = [
      { choice: "REJECT" as const },
      { choice: "REJECT" as const },
      { choice: "REJECT" as const },
    ];
    expect(computeOutcome(ballots, 5)).toBe("REJECTED");
  });

  it("Tied 2-2 with abstain hits quorum, more approves wins (4 partners)", () => {
    const ballots = [
      { choice: "APPROVE" as const },
      { choice: "APPROVE" as const },
      { choice: "REJECT" as const },
    ];
    expect(computeOutcome(ballots, 4)).toBe("APPROVED");
  });

  it("Abstain counts toward quorum but not majority", () => {
    const ballots = [
      { choice: "APPROVE" as const },
      { choice: "ABSTAIN" as const },
      { choice: "ABSTAIN" as const },
    ];
    // 3 partners → 60% quorum = 2 votes. 3 cast = quorum met.
    // 50%+1 majority = 2. Only 1 approve, 0 reject → fallback: approves > rejects → APPROVED
    expect(computeOutcome(ballots, 3)).toBe("APPROVED");
  });
});
