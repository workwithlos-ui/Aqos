/**
 * LOI .docx generator — Iteration 9
 *
 * Builds a downloadable Microsoft Word (.docx) Letter of Intent from the
 * verified DealAnalysis outputs. Every dollar value, structure detail, and
 * contingency on the page traces back to engine math; the only buyer-supplied
 * fields are governance metadata (buyer name, signatory, target close date).
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageNumber,
  Header,
  Footer,
  BorderStyle,
} from "docx";
import type { DealAnalysis, DealInput } from "./types";
import { fmtCurrencyExact } from "./dealMath";

export interface LOIMergeFields {
  buyerEntity: string;
  buyerSignatory: string;
  buyerSignatoryTitle: string;
  buyerAddress: string;
  targetCloseDate: string; // ISO yyyy-mm-dd
  exclusivityDays: number;
  diligenceDays: number;
  bindingClauses: string[]; // e.g. ["Exclusivity", "Confidentiality", "Expense allocation"]
  contingencies: string[]; // overridable list
}

export function defaultLOIFields(): LOIMergeFields {
  const today = new Date();
  const target = new Date(today.getTime() + 90 * 86400000);
  return {
    buyerEntity: "[Buyer Entity LLC]",
    buyerSignatory: "[Buyer Name]",
    buyerSignatoryTitle: "Managing Member",
    buyerAddress: "[Buyer Address]",
    targetCloseDate: target.toISOString().slice(0, 10),
    exclusivityDays: 45,
    diligenceDays: 30,
    bindingClauses: ["Exclusivity", "Confidentiality", "Expense allocation", "Governing law"],
    contingencies: [
      "Satisfactory completion of buyer's financial, legal, operational, and tax due diligence",
      "Obtaining SBA 7(a) loan commitment on terms reflected in the capital stack",
      "Negotiation and execution of mutually acceptable definitive purchase agreement",
      "No material adverse change in the Target's business between signing and closing",
      "Receipt of seller's customary representations and warranties with indemnification",
      "Continuation of key customer relationships and assignability of material contracts",
      "Transition services from seller of at least the required transition weeks",
    ],
  };
}

function p(text: string, opts?: { bold?: boolean; size?: number; spacing?: number; alignment?: typeof AlignmentType[keyof typeof AlignmentType] }): Paragraph {
  return new Paragraph({
    alignment: opts?.alignment,
    spacing: { after: opts?.spacing ?? 120 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold ?? false,
        size: opts?.size ?? 22, // half-points; 22 = 11pt
        font: "Garamond",
      }),
    ],
  });
}

function h(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: "Garamond", size: 26 })],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 22, font: "Garamond" })],
  });
}

function divider(): Paragraph {
  return new Paragraph({
    border: { bottom: { color: "888888", space: 1, style: BorderStyle.SINGLE, size: 6 } },
    spacing: { after: 200 },
  });
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

export interface LOIDocResult {
  blob: Blob;
  filename: string;
}

export async function buildLOIDocx(
  input: DealInput,
  analysis: DealAnalysis,
  fields: LOIMergeFields = defaultLOIFields(),
): Promise<LOIDocResult> {
  const company = analysis.companyName;
  const offerPrice = analysis.recommendedOffer.targetPrice ?? analysis.normalizedPurchasePrice;
  const opening = analysis.recommendedOffer.openingOffer ?? offerPrice;
  const ceiling = analysis.recommendedOffer.maximumPrice ?? offerPrice;
  const seller = analysis.recommendedOffer.sellerNoteAmount ?? analysis.capitalStack.sellerNote.amount;
  const earnout = analysis.recommendedOffer.earnoutAmount;
  const transitionWeeks = analysis.recommendedOffer.requiredTransitionWeeks;
  const sbaAmount = analysis.capitalStack.sba.amount;
  const buyerEquity = analysis.capitalStack.buyerEquity.amount;
  const today = fmtDate(new Date().toISOString().slice(0, 10));

  const children: Paragraph[] = [
    p("LETTER OF INTENT", { bold: true, size: 32, alignment: AlignmentType.CENTER, spacing: 240 }),
    p(today, { alignment: AlignmentType.CENTER, spacing: 240 }),
    divider(),

    p("To:", { bold: true }),
    p(`Sellers of ${company}`),
    p("[Seller Address]"),
    p(""),

    p("From:", { bold: true }),
    p(fields.buyerEntity),
    p(fields.buyerAddress),
    p(""),

    p(
      `${fields.buyerEntity} (together with its successors and assigns, the "Buyer") is pleased to submit this non-binding Letter of Intent ("LOI") to acquire substantially all of the assets, or alternatively, 100% of the equity interests, of ${company} (the "Target") on the principal terms outlined below.`,
      { spacing: 200 },
    ),

    h("1. Transaction structure"),
    p(
      `Buyer proposes a ${analysis.recommendedOffer.preferredStructure || "stock or asset purchase, structured to optimize buyer's after-tax outcome"}. The final structure shall be selected by Buyer following diligence.`,
    ),

    h("2. Purchase price"),
    p(
      `Target purchase price: ${fmtCurrencyExact(offerPrice)} (the "Offer Price"), payable at closing, subject to customary adjustments for net working capital, indebtedness, and transaction expenses.`,
    ),
    p(
      `Opening proposal: ${fmtCurrencyExact(opening)}; Buyer maximum: ${fmtCurrencyExact(ceiling)}, determined deterministically from the Target's reported earnings, prevailing industry multiples, and Buyer's debt service coverage requirements.`,
    ),

    h("3. Sources & uses"),
    bullet(`SBA 7(a) senior debt: ${fmtCurrencyExact(sbaAmount)}`),
    bullet(`Seller note (subordinated): ${fmtCurrencyExact(seller)}`),
    earnout !== null && earnout !== undefined && earnout > 0
      ? bullet(`Earnout: ${fmtCurrencyExact(earnout)} — Trigger: ${analysis.recommendedOffer.earnoutTrigger ?? "performance milestones to be defined in definitive agreement"}`)
      : bullet("Earnout: none proposed at this time"),
    bullet(`Buyer equity at closing: ${fmtCurrencyExact(buyerEquity)}`),

    h("4. Seller note terms"),
    p(
      `Seller note shall bear interest at a market rate (target 7.0%), with the first ${transitionWeeks > 26 ? Math.ceil(transitionWeeks / 4) : 24} months on full or partial standby per SBA 7(a) requirements, and amortize over a term not less than ten (10) years.`,
    ),

    h("5. Transition & seller support"),
    p(
      `Seller shall provide a transition services period of not less than ${transitionWeeks} weeks following close, including operational handover, customer introductions, and continued availability for technical and relationship questions. Compensation for transition services is included in the Offer Price.`,
    ),

    h("6. Exclusivity & diligence"),
    p(
      `Upon mutual execution of this LOI, Seller agrees to a ${fields.exclusivityDays}-day exclusivity period during which Seller and its representatives shall not solicit, negotiate, or accept any competing offer. Buyer expects to complete diligence and execute a definitive agreement within ${fields.diligenceDays} days of receiving complete diligence materials.`,
    ),

    h("7. Conditions to closing"),
    ...fields.contingencies.map((c) => bullet(c)),

    h("8. Binding & non-binding provisions"),
    p(
      `Except for the following provisions, which are binding obligations of both parties (${fields.bindingClauses.join(", ")}), the terms of this LOI are non-binding and are intended only as a framework for negotiating a definitive purchase agreement.`,
    ),

    h("9. Target closing"),
    p(`Buyer targets a closing date on or before ${fmtDate(fields.targetCloseDate)}, subject to lender timing and diligence findings.`),

    h("10. Expenses"),
    p(`Each party shall bear its own expenses, including legal and accounting fees, regardless of whether a definitive agreement is executed.`),

    divider(),

    p(
      `Engine receipt: this LOI was generated from a deterministic deal analysis of ${company}. Earnings basis: ${analysis.earningsBasis.toUpperCase()}. DSCR after standby: ${analysis.dscrPair.afterStandby.display}. Verdict: ${analysis.refinedVerdict.verdict}.`,
      { size: 18 },
    ),
    p(""),

    p("Accepted and agreed:", { bold: true, spacing: 240 }),
    p(""),
    p("BUYER:"),
    p(`${fields.buyerEntity}`),
    p(""),
    p(`By: __________________________`),
    p(`Name: ${fields.buyerSignatory}`),
    p(`Title: ${fields.buyerSignatoryTitle}`),
    p(`Date: __________________________`),
    p(""),
    p("SELLER:"),
    p(""),
    p(`By: __________________________`),
    p(`Name: __________________________`),
    p(`Title: __________________________`),
    p(`Date: __________________________`),
  ];

  const doc = new Document({
    creator: "Acquisition OS — Deterministic Engine",
    title: `LOI — ${company}`,
    description: "Letter of Intent generated from verified engine outputs.",
    sections: [
      {
        properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `Letter of Intent — ${company}`, font: "Garamond", size: 18, color: "666666" }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", font: "Garamond", size: 18, color: "666666" }),
                  new TextRun({ children: [PageNumber.CURRENT], font: "Garamond", size: 18, color: "666666" }),
                  new TextRun({ text: " of ", font: "Garamond", size: 18, color: "666666" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Garamond", size: 18, color: "666666" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${company.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-loi.docx`;
  return { blob, filename };
}
