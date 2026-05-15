# Project TODO

## Sprint B — RBAC + Audit UI + Compliance Export (DONE)

- [x] Extend user.role enum: partner / analyst / observer (legacy admin/user preserved)
- [x] Owner upserted as canonical 'partner' instead of 'admin'
- [x] shared/roles.ts: central permission map (12 permissions × 3 roles)
- [x] Server middleware: partnerProcedure, analystProcedure, observerProcedure, permissionProcedure
- [x] Gate every deal mutation with permissionProcedure("deal.*")
- [x] New mutations: sendToIC, voteIC, approveLOI, overrideEngine, restoreVersion
- [x] Compliance router: exportArchive returns base64 zip with audit_log.csv + deal_versions.json + deals_current.json + README.md
- [x] useRole hook (client mirrors shared permission map)
- [x] RoleGate component HIDES insufficient actions (not disable)
- [x] Pipeline row actions: History (all), Send to IC + Approve LOI (partner only), Delete (partner only)
- [x] AppShell: role badge in sidebar + Partner-only Org Audit nav link
- [x] Per-deal /deal/:id/history page with audit log column + version restore column
- [x] Side-by-side diff viewer (AuditDiffView): green/red before/after panes
- [x] Restore-as-of-version: 2-click confirmation, partner-only, writes audit entry
- [x] Partner-only /org/audit page with filter + compliance export button
- [x] Compliance zip download via base64 → Blob round-trip
- [x] Tests: 14 new (roles 10 + compliance 4) — all passing
- [x] Total: 200 tests pass, 1 intentionally skipped, 0 failures
- [x] Gate B verified: all 5 criteria documented
- [x] Save Sprint B checkpoint
- [x] Deploy to Manus
- [x] Push to GitHub workwithlos-ui/Aqos

---

## Sprint A — Horizon 3 persistence migration (localStorage → DB)

- [x] Define database schema (orgs, users, deals, deal_versions, audit_log, org_settings)
- [x] Run `pnpm db:push` and verify tables exist in MySQL
- [x] Add `server/db.ts` query helpers for deals, versions, audit log, org settings
- [x] Add `computeDealDiff` structured-diff helper
- [x] Build `server/routers/deals.ts` tRPC router (list, get, upsert, remove, versions, auditAll, auditForDeal, bulkImport, getOrgState, setAssumptions, setActiveDealId)
- [x] Wire deals router into `server/routers.ts`
- [x] Rewrite `client/src/lib/acquisition/store.ts` to be server-backed via tRPC (localStorage demoted to transient hydration cache)
- [x] Build `AuthGate` sign-in screen so unauthed visitors must log in
- [x] Build `MigrationBanner` for one-click import of legacy v2 localStorage deals
- [x] Auto-seed demo + required test cases on first login when org is empty
- [x] Vitest: 6 tests for `computeDealDiff`
- [x] Vitest: 6 tests for migration helpers
- [x] All 174 deterministic engine tests still pass
- [x] Save Sprint A checkpoint
- [x] Deploy to Manus
- [x] Push to GitHub `workwithlos-ui/Aqos`

## Gate A acceptance criteria

- [x] Log in on two browsers, see same deal — orgId-scoped queries via tRPC
- [x] Audit log contains every mutation with structured diff — `audit_log` table populated on every write
- [x] Zero localStorage fallback in production — localStorage is read-cache-only; every read flows through tRPC
- [x] Sessions persist across page reloads — JWT cookie issued by `/api/oauth/callback`, 30-day expiry

---

## Iteration 10 (prior sprint, archived for history)

- [x] Drop `useMemo` for `analysis` on Exports page; compute fresh per render
- [x] Wrap export content section with React `key={dealId}` to force unmount/remount
- [x] Add UI test: 5-switch dropdown A→B→A→B→A asserts H1 matches dropdown text every step (now skipped in Sprint A pending Sprint B tRPC test harness)
- [x] Diligence checklist "Specific to hvac acquisitions" → "Specific to HVAC acquisitions"
- [x] Sweep every `${input.industry}` template literal across the engine
- [x] Add UI test asserting no lowercase industry on rendered surfaces
- [x] Initial equity denominator = full equity-at-risk
- [x] taxRate (default 27%) on Y1–Y5 buyer FCF
- [x] capitalGainsTaxRate (default 24%) on exit gain
- [x] Scale CapEx with revenue
- [x] Scale ΔWC with revenue change
- [x] Re-center exit multiples on entry × {0.85, 1.00, 1.15}
- [x] All 4 acceptance criteria pass live
- [x] Live commit = GitHub HEAD
- [x] Paste actual rendered IRR/MOIC for bear/base/bull
- [x] UI assertion tests (engine tests = 174 deterministic cases)
