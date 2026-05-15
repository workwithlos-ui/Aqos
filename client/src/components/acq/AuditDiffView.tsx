/** AuditDiffView — render a list of {field, before, after} diff entries. */

type DiffEntry = { field: string; before: unknown; after: unknown };

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 0 ? value : "(empty string)";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "(unserializable)";
  }
}

export function AuditDiffView({
  diff,
  emptyHint = "No fields changed.",
}: {
  diff: DiffEntry[] | null | undefined;
  emptyHint?: string;
}) {
  if (!diff || diff.length === 0) {
    return <div className="text-xs text-foreground/50 italic">{emptyHint}</div>;
  }
  return (
    <div className="space-y-2" data-testid="audit-diff-view">
      {diff.map((entry, i) => (
        <div key={`${entry.field}-${i}`} className="rounded-md border border-border bg-muted/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-foreground/60 font-semibold mb-2">
            {entry.field}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <div className="text-[10px] uppercase text-rose-700/70 mb-1">Before</div>
              <pre className="whitespace-pre-wrap break-words bg-rose-50 border border-rose-200 rounded px-2 py-1.5 text-rose-900 max-h-40 overflow-auto">
                {fmt(entry.before)}
              </pre>
            </div>
            <div>
              <div className="text-[10px] uppercase text-emerald-700/70 mb-1">After</div>
              <pre className="whitespace-pre-wrap break-words bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5 text-emerald-900 max-h-40 overflow-auto">
                {fmt(entry.after)}
              </pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
