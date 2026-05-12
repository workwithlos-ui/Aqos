import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDealStore } from "@/lib/acquisition/store";
import { DEFAULT_BUY_BOX } from "@/lib/acquisition/thesis";
import type { BuyBox } from "@/lib/acquisition/types";
import { useState } from "react";

export default function BuyBoxPage() {
  const [buyBox, setBuyBox] = useState<BuyBox>(DEFAULT_BUY_BOX);

  const handleChange = (key: keyof BuyBox, value: unknown) => {
    setBuyBox({ ...buyBox, [key]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Buy Box / Thesis</h1>
        <p className="text-muted-foreground mt-2">
          Define your acquisition thesis and target criteria. Every deal is scored against this framework.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Target Industries */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Target Industries</CardTitle>
            <CardDescription>Comma-separated list</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              placeholder="e.g., plumbing, hvac, electrical"
              value={buyBox.targetIndustries.join(", ")}
              onChange={(e) =>
                handleChange(
                  "targetIndustries",
                  e.target.value.split(",").map((s) => s.trim()),
                )
              }
              className="h-20"
            />
          </CardContent>
        </Card>

        {/* Excluded Industries */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Excluded Industries</CardTitle>
            <CardDescription>Never pursue these</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              placeholder="e.g., restaurant, retail"
              value={buyBox.excludedIndustries.join(", ")}
              onChange={(e) =>
                handleChange(
                  "excludedIndustries",
                  e.target.value.split(",").map((s) => s.trim()),
                )
              }
              className="h-20"
            />
          </CardContent>
        </Card>

        {/* Revenue Range */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue Range</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Minimum ($)</Label>
              <Input
                type="number"
                value={buyBox.revenueMin ?? ""}
                onChange={(e) => handleChange("revenueMin", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="500000"
              />
            </div>
            <div>
              <Label>Maximum ($)</Label>
              <Input
                type="number"
                value={buyBox.revenueMax ?? ""}
                onChange={(e) => handleChange("revenueMax", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="10000000"
              />
            </div>
          </CardContent>
        </Card>

        {/* Earnings Range */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Earnings Range (EBITDA/SDE)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Minimum ($)</Label>
              <Input
                type="number"
                value={buyBox.earningsMin ?? ""}
                onChange={(e) => handleChange("earningsMin", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="100000"
              />
            </div>
            <div>
              <Label>Maximum ($)</Label>
              <Input
                type="number"
                value={buyBox.earningsMax ?? ""}
                onChange={(e) => handleChange("earningsMax", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="2000000"
              />
            </div>
          </CardContent>
        </Card>

        {/* Margin & Concentration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Profitability & Risk</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Minimum Margin (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={buyBox.minMarginPct ?? ""}
                onChange={(e) => handleChange("minMarginPct", e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="10"
              />
            </div>
            <div>
              <Label>Max Customer Concentration (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={buyBox.maxCustomerConcentrationPct ?? ""}
                onChange={(e) => handleChange("maxCustomerConcentrationPct", e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="30"
              />
            </div>
          </CardContent>
        </Card>

        {/* Strategic Rationale */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Strategic Rationale</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Why are we pursuing this thesis? What value do we create?"
              value={buyBox.strategicRationale}
              onChange={(e) => handleChange("strategicRationale", e.target.value)}
              className="h-24"
            />
          </CardContent>
        </Card>

        {/* Red Flags */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Red Flags (Auto-Detect)</CardTitle>
            <CardDescription>Patterns that trigger automatic rejection</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="e.g., Declining revenue, Sole owner, High customer concentration"
              value={buyBox.redFlags.join("\n")}
              onChange={(e) => handleChange("redFlags", e.target.value.split("\n").filter((s) => s.trim()))}
              className="h-20"
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setBuyBox(DEFAULT_BUY_BOX)}>
          Reset to Default
        </Button>
        <Button onClick={() => {
          // Save to store or context
          // eslint-disable-next-line no-console
          console.log("Buy Box saved:", buyBox);
        }}>
          Save Buy Box
        </Button>
      </div>
    </div>
  );
}
