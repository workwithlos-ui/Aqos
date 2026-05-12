import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDealStore } from "@/lib/acquisition/store";
import { useState } from "react";

export default function WorkingCapitalPage() {
  const { deals, upsertDeal } = useDealStore();
  const currentDeal = deals[0]; // Use first deal or implement deal selection
  const [wcData, setWcData] = useState(currentDeal?.workingCapital ?? {});

  const handleChange = (key: string, value: unknown) => {
    const updated = { ...wcData, [key]: value };
    setWcData(updated);
    if (currentDeal) {
      upsertDeal({ ...currentDeal, workingCapital: updated });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Working Capital Analysis</h1>
        <p className="text-muted-foreground mt-2">
          Working capital impacts cash flow post-close. Missing data blocks close-ready status.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AR / AP / Inventory */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current Assets & Liabilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Accounts Receivable ($)</Label>
              <Input
                type="number"
                value={String((wcData as Record<string, unknown>).arBalance ?? "")}
                onChange={(e) => handleChange("arBalance", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Accounts Payable ($)</Label>
              <Input
                type="number"
                value={String((wcData as Record<string, unknown>).apBalance ?? "")}
                onChange={(e) => handleChange("apBalance", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Inventory ($)</Label>
              <Input
                type="number"
                value={String((wcData as Record<string, unknown>).inventoryBalance ?? "")}
                onChange={(e) => handleChange("inventoryBalance", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Cash Included in Deal ($)</Label>
              <Input
                type="number"
                value={String((wcData as Record<string, unknown>).cashIncluded ?? "")}
                onChange={(e) => handleChange("cashIncluded", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="0"
              />
            </div>
          </CardContent>
        </Card>

        {/* Days Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cash Conversion Cycle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>DSO — Days Sales Outstanding</Label>
              <Input
                type="number"
                value={String((wcData as Record<string, unknown>).dso ?? "")}
                onChange={(e) => handleChange("dso", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="30"
              />
            </div>
            <div>
              <Label>DPO — Days Payable Outstanding</Label>
              <Input
                type="number"
                value={String((wcData as Record<string, unknown>).dpo ?? "")}
                onChange={(e) => handleChange("dpo", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="30"
              />
            </div>
            <div>
              <Label>DIO — Days Inventory Outstanding</Label>
              <Input
                type="number"
                value={String((wcData as Record<string, unknown>).dio ?? "")}
                onChange={(e) => handleChange("dio", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="45"
              />
            </div>
          </CardContent>
        </Card>

        {/* Seasonality & Liquidity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Liquidity & Risk</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <Label>Monthly Revenue ($)</Label>
              <Input
                type="number"
                value={String((wcData as Record<string, unknown>).monthlyRevenue ?? "")}
                onChange={(e) => handleChange("monthlyRevenue", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Monthly Fixed Costs ($)</Label>
              <Input
                type="number"
                value={String((wcData as Record<string, unknown>).monthlyFixedCosts ?? "")}
                onChange={(e) => handleChange("monthlyFixedCosts", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Seasonality Factor (0.8–1.2)</Label>
              <Input
                type="number"
                step="0.1"
                value={String((wcData as Record<string, unknown>).seasonalityFactor ?? "")}
                onChange={(e) => handleChange("seasonalityFactor", e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="1.0"
              />
            </div>
          </CardContent>
        </Card>

        {/* Peg & Buffer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Working Capital Peg</CardTitle>
            <CardDescription>% of revenue to hold as working capital</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>WC Peg (% of Revenue)</Label>
              <Input
                type="number"
                step="0.1"
                value={String((wcData as Record<string, unknown>).workingCapitalPeg ?? "")}
                onChange={(e) => handleChange("workingCapitalPeg", e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="10"
              />
            </div>
            <div>
              <Label>Required Liquidity Buffer (months)</Label>
              <Input
                type="number"
                value={String((wcData as Record<string, unknown>).requiredLiquidityBufferMonths ?? "")}
                onChange={(e) => handleChange("requiredLiquidityBufferMonths", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="0"
              />
            </div>
          </CardContent>
        </Card>

        {/* Debt & CapEx */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Debt & Capital Needs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Existing Debt Balance ($)</Label>
              <Input
                type="number"
                value={String((wcData as Record<string, unknown>).totalDebtBalance ?? "")}
                onChange={(e) => handleChange("totalDebtBalance", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Annual CapEx Needs ($)</Label>
              <Input
                type="number"
                value={String((wcData as Record<string, unknown>).capExNeedsAnnual ?? "")}
                onChange={(e) => handleChange("capExNeedsAnnual", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="0"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
