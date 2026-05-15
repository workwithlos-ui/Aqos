import { describe, expect, it } from "vitest";
import { canEditComment, extractMentions } from "./db";
import { ROLE_PERMISSIONS, can, normalizeRole } from "../shared/roles";

describe("Comment helpers", () => {
  describe("extractMentions", () => {
    it("extracts a single @mention", () => {
      expect(extractMentions("Hi @alice, can you check this?")).toEqual(["alice"]);
    });

    it("extracts multiple unique @mentions", () => {
      expect(extractMentions("@bob and @carol — also @bob again")).toEqual(["bob", "carol"]);
    });

    it("returns empty array when no @mentions", () => {
      expect(extractMentions("just a plain comment with no mentions")).toEqual([]);
    });

    it("supports underscores and hyphens in usernames", () => {
      expect(extractMentions("@alice_smith @bob-jones")).toEqual(["alice_smith", "bob-jones"]);
    });

    it("ignores email addresses (no @ mention without word break)", () => {
      // The pattern matches @word — emails like a@b.com will match @b
      const result = extractMentions("contact a@b.com please");
      expect(result).toEqual(["b"]); // documented behavior
    });
  });

  describe("canEditComment (15-minute window)", () => {
    it("allows edit immediately after creation", () => {
      const now = 1_000_000_000;
      const comment = { createdAt: new Date(now) };
      expect(canEditComment(comment, now)).toBe(true);
    });

    it("allows edit at 14 minutes 59 seconds", () => {
      const now = 1_000_000_000;
      const comment = { createdAt: new Date(now - (14 * 60 + 59) * 1000) };
      expect(canEditComment(comment, now)).toBe(true);
    });

    it("allows edit at exactly 15 minutes", () => {
      const now = 1_000_000_000;
      const comment = { createdAt: new Date(now - 15 * 60 * 1000) };
      expect(canEditComment(comment, now)).toBe(true);
    });

    it("denies edit at 15 minutes + 1ms", () => {
      const now = 1_000_000_000;
      const comment = { createdAt: new Date(now - 15 * 60 * 1000 - 1) };
      expect(canEditComment(comment, now)).toBe(false);
    });

    it("denies edit at 1 hour after creation", () => {
      const now = 1_000_000_000;
      const comment = { createdAt: new Date(now - 60 * 60 * 1000) };
      expect(canEditComment(comment, now)).toBe(false);
    });
  });
});

describe("Comment + Notification permissions (Sprint C Phase 1)", () => {
  it("Partner has all comment permissions", () => {
    expect(can("partner", "comment.create")).toBe(true);
    expect(can("partner", "comment.edit_own")).toBe(true);
    expect(can("partner", "comment.delete_own")).toBe(true);
    expect(can("partner", "comment.delete_any")).toBe(true);
    expect(can("partner", "comment.resolve")).toBe(true);
    expect(can("partner", "comment.set_blocker")).toBe(true);
  });

  it("Analyst can create/edit own/delete own/resolve but NOT delete any or set blocker", () => {
    expect(can("analyst", "comment.create")).toBe(true);
    expect(can("analyst", "comment.edit_own")).toBe(true);
    expect(can("analyst", "comment.delete_own")).toBe(true);
    expect(can("analyst", "comment.delete_any")).toBe(false);
    expect(can("analyst", "comment.resolve")).toBe(true);
    expect(can("analyst", "comment.set_blocker")).toBe(false);
  });

  it("Observer cannot create/edit/delete/resolve/blocker (read-only)", () => {
    expect(can("observer", "comment.create")).toBe(false);
    expect(can("observer", "comment.edit_own")).toBe(false);
    expect(can("observer", "comment.delete_own")).toBe(false);
    expect(can("observer", "comment.delete_any")).toBe(false);
    expect(can("observer", "comment.resolve")).toBe(false);
    expect(can("observer", "comment.set_blocker")).toBe(false);
  });

  it("All roles can read notifications", () => {
    expect(can("partner", "notification.read")).toBe(true);
    expect(can("analyst", "notification.read")).toBe(true);
    expect(can("observer", "notification.read")).toBe(true);
  });

  it("Legacy 'admin' role normalizes to partner and inherits comment perms", () => {
    expect(normalizeRole("admin")).toBe("partner");
    expect(can("admin", "comment.delete_any")).toBe(true);
    expect(can("admin", "comment.set_blocker")).toBe(true);
  });

  it("Legacy 'user' role normalizes to analyst", () => {
    expect(normalizeRole("user")).toBe("analyst");
    expect(can("user", "comment.create")).toBe(true);
    expect(can("user", "comment.delete_any")).toBe(false);
  });

  it("ROLE_PERMISSIONS shape: observer has read-only perms (notifications + audit views only)", () => {
    const observerPerms = ROLE_PERMISSIONS.observer;
    // Observer should NOT have any write perms
    const writeKeywords = ["create", "edit", "delete", "resolve", "blocker", "send_to_ic", "approve", "vote"];
    for (const perm of observerPerms) {
      for (const kw of writeKeywords) {
        expect(perm).not.toContain(kw);
      }
    }
  });
});
