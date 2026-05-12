import type { DealInput, IntegrationGate, IntegrationInputs, IntegrationResult } from "./types";

export function scoreIntegration(input: DealInput): IntegrationResult {
  const integ = input.integration ?? {};

  const gates: IntegrationGate[] = [];
  const blockers: string[] = [];
  const requiredActions: string[] = [];

  // Complexity assessment
  const complexity = integ.complexity ?? "medium";
  const complexityScore =
    complexity === "low"
      ? 80
      : complexity === "medium"
        ? 60
        : complexity === "high"
          ? 40
          : 20;

  // Integration lead
  const leadAssigned = integ.integrationLeadAssigned ?? false;
  const leadCapacity = integ.integrationLeadCapacityHrsPerWeek ?? null;
  gates.push({
    key: "integration_lead",
    label: "Integration Lead Assigned",
    status: leadAssigned ? "pass" : "fail",
    detail: leadAssigned
      ? `Lead assigned with ${leadCapacity ?? "unknown"} hrs/week capacity.`
      : "No integration lead assigned.",
  });
  if (!leadAssigned) {
    blockers.push("Integration lead not assigned");
    requiredActions.push("Assign integration lead before close");
  }

  // Key employees
  const keyEmpsIdentified = integ.keyEmployeesIdentified ?? false;
  const keyEmpsRetention = integ.keyEmployeeRetentionPlan ?? false;
  gates.push({
    key: "key_employees",
    label: "Key Employees Identified & Retention Plan",
    status: keyEmpsIdentified && keyEmpsRetention ? "pass" : "fail",
    detail: keyEmpsIdentified
      ? keyEmpsRetention
        ? "Key employees identified with retention plan."
        : "Key employees identified but no retention plan."
      : "Key employees not identified.",
  });
  if (!keyEmpsIdentified) {
    blockers.push("Key employees not identified");
    requiredActions.push("Identify and secure key employee retention");
  }

  // Customer communication
  const custComm = integ.customerCommunicationPlan ?? false;
  gates.push({
    key: "customer_communication",
    label: "Customer Communication Plan",
    status: custComm ? "pass" : "fail",
    detail: custComm
      ? "Customer communication plan drafted."
      : "No customer communication plan.",
  });
  if (!custComm) {
    requiredActions.push("Draft customer communication plan");
  }

  // Systems migration
  const sysMig = integ.systemsMigrationPlan ?? false;
  gates.push({
    key: "systems_migration",
    label: "Systems Migration Plan",
    status: sysMig ? "pass" : "fail",
    detail: sysMig ? "Systems migration plan drafted." : "No systems migration plan.",
  });
  if (!sysMig) {
    requiredActions.push("Draft systems migration plan");
  }

  // Accounting/Payroll/Vendor transition
  const acctTrans = integ.accountingTransitionPlan ?? false;
  const payrollTrans = integ.payrollTransitionPlan ?? false;
  const vendorTrans = integ.vendorTransitionPlan ?? false;
  const allTransPlans = acctTrans && payrollTrans && vendorTrans;
  gates.push({
    key: "transition_plans",
    label: "Accounting/Payroll/Vendor Transition Plans",
    status: allTransPlans ? "pass" : "fail",
    detail: allTransPlans
      ? "All transition plans drafted."
      : `Missing: ${!acctTrans ? "Accounting " : ""}${!payrollTrans ? "Payroll " : ""}${!vendorTrans ? "Vendor" : ""}`,
  });
  if (!allTransPlans) {
    requiredActions.push("Complete transition plans for accounting, payroll, vendors");
  }

  // 100-day plan
  const hundredDayDrafted = integ.hundredDayPlanDrafted ?? false;
  gates.push({
    key: "hundred_day_plan",
    label: "100-Day Plan Drafted",
    status: hundredDayDrafted ? "pass" : "fail",
    detail: hundredDayDrafted
      ? "100-day plan drafted."
      : "No 100-day plan.",
  });
  if (!hundredDayDrafted) {
    requiredActions.push("Draft 100-day integration plan");
  }

  // SOP transfer
  const sopStatus = integ.sopTransferStatus ?? "missing";
  gates.push({
    key: "sop_transfer",
    label: "SOP Transfer Status",
    status: sopStatus === "complete" ? "pass" : sopStatus === "in_progress" ? "pass" : "fail",
    detail: `SOP transfer: ${sopStatus}.`,
  });
  if (sopStatus === "missing" || sopStatus === "not_started") {
    requiredActions.push("Initiate SOP transfer and documentation");
  }

  // Seller transition
  const sellerTransWeeks = integ.sellerTransitionWeeks ?? null;
  gates.push({
    key: "seller_transition",
    label: "Seller Transition Terms",
    status: sellerTransWeeks !== null ? "pass" : "fail",
    detail: sellerTransWeeks !== null
      ? `Seller transition: ${sellerTransWeeks} weeks.`
      : "Seller transition terms not defined.",
  });
  if (sellerTransWeeks === null) {
    requiredActions.push("Negotiate seller transition terms");
  }

  // Culture risk
  const cultureRisk = integ.cultureRisk ?? "missing";
  gates.push({
    key: "culture_risk",
    label: "Culture Risk Assessment",
    status: cultureRisk !== "missing" ? "pass" : "fail",
    detail: cultureRisk !== "missing"
      ? `Culture risk: ${cultureRisk}.`
      : "Culture risk not assessed.",
  });

  // Compute readiness score
  const passedGates = gates.filter((g) => g.status === "pass").length;
  const readinessScore = (passedGates / gates.length) * 100;

  // Determine status
  let status: IntegrationResult["status"] = "ready";
  if (readinessScore >= 80) status = "ready";
  else if (readinessScore >= 50) status = "in_progress";
  else status = "not_ready";

  // Determine risk
  let integRisk: IntegrationResult["integrationRisk"] = "missing";
  if (complexity === "low") integRisk = "low";
  else if (complexity === "medium") integRisk = "medium";
  else if (complexity === "high") integRisk = "high";
  else integRisk = "critical";

  const hundredDayReady = hundredDayDrafted && readinessScore >= 70;
  const canCloseSafely = leadAssigned && keyEmpsIdentified && readinessScore >= 60;

  return {
    status,
    readinessScore,
    gates,
    blockers,
    requiredActions,
    hundredDayReady,
    canCloseSafely,
    integrationRisk: integRisk,
    rationale:
      status === "ready"
        ? "Integration plan is substantially complete."
        : status === "in_progress"
          ? "Integration plan is in progress; key items remain."
          : "Integration plan is incomplete; significant work required before close.",
  };
}
