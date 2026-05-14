import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDealStore } from "@/lib/acquisition/store";
import type { DealInput } from "@/lib/acquisition/types";

export function ActiveDealPicker({
  label = "Active deal",
  className,
  filter,
}: {
  label?: string;
  className?: string;
  filter?: (d: DealInput) => boolean;
}) {
  const { deals, activeDealId, setActiveDealId } = useDealStore();
  const visible = filter ? deals.filter(filter) : deals;
  const value = activeDealId && visible.some((d) => d.id === activeDealId) ? activeDealId : (visible[0]?.id ?? "");
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <Select value={value} onValueChange={(v) => setActiveDealId(v)}>
        <SelectTrigger>
          <SelectValue placeholder="Select a deal" />
        </SelectTrigger>
        <SelectContent>
          {visible.map((d) => (
            <SelectItem key={d.id} value={d.id ?? ""}>
              {(d.companyName?.trim() || "Untitled deal")}
              {d.isDemo ? " (demo)" : d.isTest ? " (test)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
