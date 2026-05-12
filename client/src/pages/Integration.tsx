import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useDealStore } from "@/lib/acquisition/store";
import { useState } from "react";
import type { IntegrationInputs } from "@/lib/acquisition/types";

export default function IntegrationPage() {
  const { deals, upsertDeal } = useDealStore();
  const currentDeal = deals[0];
  const [intData, setIntData] = useState<IntegrationInputs>(currentDeal?.integration ?? {});

  const handleChange = (key: keyof IntegrationInputs, value: unknown) => {
    const updated = { ...intData, [key]: value };
    setIntData(updated);
    if (currentDeal) {
      upsertDeal({ ...currentDeal, integration: updated });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Integration Readiness</h1>
        <p className="text-muted-foreground mt-2">
          Assess integration complexity and readiness. Missing data blocks 100-day readiness.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Complexity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Integration Complexity</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="w-full px-2 py-1 border rounded"
              value={intData.complexity ?? ""}
              onChange={(e) => handleChange("complexity", e.target.value as any)}
            >
              <option value="">— Select —</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </CardContent>
        </Card>

        {/* Seller Transition */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Seller Transition</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label>Weeks Available for Transition</Label>
              <Input
                type="number"
                value={String(intData.sellerTransitionWeeks ?? "")}
                onChange={(e) => handleChange("sellerTransitionWeeks", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="4"
              />
            </div>
          </CardContent>
        </Card>

        {/* Leadership & Staffing */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Leadership & Staffing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={intData.integrationLeadAssigned ?? false}
                onCheckedChange={(v) => handleChange("integrationLeadAssigned", v)}
              />
              <Label>Integration Lead Assigned</Label>
            </div>
            {intData.integrationLeadAssigned && (
              <div>
                <Label>Integration Lead Capacity (hrs/week)</Label>
                <Input
                  type="number"
                  value={String(intData.integrationLeadCapacityHrsPerWeek ?? "")}
                  onChange={(e) => handleChange("integrationLeadCapacityHrsPerWeek", e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="40"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                checked={intData.keyEmployeesIdentified ?? false}
                onCheckedChange={(v) => handleChange("keyEmployeesIdentified", v)}
              />
              <Label>Key Employees Identified</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={intData.keyEmployeeRetentionPlan ?? false}
                onCheckedChange={(v) => handleChange("keyEmployeeRetentionPlan", v)}
              />
              <Label>Key Employee Retention Plan in Place</Label>
            </div>
          </CardContent>
        </Card>

        {/* Plans */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Integration Plans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={intData.customerCommunicationPlan ?? false}
                onCheckedChange={(v) => handleChange("customerCommunicationPlan", v)}
              />
              <Label>Customer Communication Plan</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={intData.systemsMigrationPlan ?? false}
                onCheckedChange={(v) => handleChange("systemsMigrationPlan", v)}
              />
              <Label>Systems Migration Plan</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={intData.accountingTransitionPlan ?? false}
                onCheckedChange={(v) => handleChange("accountingTransitionPlan", v)}
              />
              <Label>Accounting Transition Plan</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={intData.payrollTransitionPlan ?? false}
                onCheckedChange={(v) => handleChange("payrollTransitionPlan", v)}
              />
              <Label>Payroll Transition Plan</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={intData.vendorTransitionPlan ?? false}
                onCheckedChange={(v) => handleChange("vendorTransitionPlan", v)}
              />
              <Label>Vendor Transition Plan</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={intData.hundredDayPlanDrafted ?? false}
                onCheckedChange={(v) => handleChange("hundredDayPlanDrafted", v)}
              />
              <Label>100-Day Plan Drafted</Label>
            </div>
          </CardContent>
        </Card>

        {/* SOP & Culture */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">SOP Transfer</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="w-full px-2 py-1 border rounded"
              value={intData.sopTransferStatus ?? ""}
              onChange={(e) => handleChange("sopTransferStatus", e.target.value as any)}
            >
              <option value="">— Select —</option>
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="complete">Complete</option>
              <option value="missing">Missing</option>
            </select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Culture Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="w-full px-2 py-1 border rounded"
              value={intData.cultureRisk ?? ""}
              onChange={(e) => handleChange("cultureRisk", e.target.value as any)}
            >
              <option value="">— Select —</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="missing">Missing</option>
            </select>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
