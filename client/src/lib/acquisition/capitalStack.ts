// Thin re-export module so importers can use a focused capital-stack API
// (`buildCapitalStack`, `DEFAULT_ASSUMPTIONS`, `validateAssumptions`) without
// reaching into dealMath.ts internals.

export {
  DEFAULT_ASSUMPTIONS,
  buildCapitalStack,
  validateAssumptions,
  annualDebtService,
} from "./dealMath";

export type {
  CapitalStackAssumptions,
  CapitalStackResult,
  CapitalStackComponent,
} from "./types";
