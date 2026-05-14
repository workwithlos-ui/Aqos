import { AlertTriangle, AlertOctagon, Info } from "lucide-react";
import type { DealAnomaly } from "@/lib/acquisition/types";

/**
 * AnomalyBanner — the single rendered surface for engine-detected anomalies.
 * Lives on the Deal Analyzer page directly under the headline verdict. The
 * Red Team page, IC memo, and Exports header all subscribe to the same
 * `analysis.anomalies` array (the AnomalyBus pattern): one source, many
 * consumers. The Copilot "Challenge my assumptions" intent reads the same
 * array.
 */
export function AnomalyBanner({ anomaly }: { anomaly: DealAnomaly }) {
  const tone =
    anomaly.severity === "critical"
      ? "border-rose-300/70 bg-rose-50/70 text-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
      : anomaly.severity === "watch"
        ? "border-amber-300/70 bg-amber-50/80 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        : "border-sky-300/60 bg-sky-50/70 text-sky-900 dark:bg-sky-950/30 dark:text-sky-100";
  const Icon =
    anomaly.severity === "critical"
      ? AlertOctagon
      : anomaly.severity === "watch"
        ? AlertTriangle
        : Info;
  return (
    <div
      data-anomaly-id={anomaly.id}
      data-testid={`anomaly-banner-${anomaly.id}`}
      className={`flex items-start gap-3 rounded-lg border p-3 text-sm shadow-sm ${tone}`}
    >
      <Icon className="size-4 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <div className="font-semibold">{anomaly.title}</div>
        <p className="leading-relaxed">{anomaly.detail}</p>
        {anomaly.diligenceTriggers && anomaly.diligenceTriggers.length > 0 && (
          <ul className="list-disc list-inside text-xs opacity-90 pt-1">
            {anomaly.diligenceTriggers.slice(0, 3).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function AnomalyBannerStack({
  anomalies,
}: {
  anomalies: DealAnomaly[] | undefined;
}) {
  if (!anomalies || anomalies.length === 0) return null;
  // Critical first, then watch, then info.
  const order = { critical: 0, watch: 1, info: 2 } as const;
  const sorted = [...anomalies].sort(
    (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9),
  );
  return (
    <div className="flex flex-col gap-2" data-testid="anomaly-banner-stack">
      {sorted.map((a) => (
        <AnomalyBanner key={a.id} anomaly={a} />
      ))}
    </div>
  );
}
