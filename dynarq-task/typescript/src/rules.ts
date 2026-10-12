// Payment reminder rules engine (part 1). Pure functions only: no files, no clock,
// no network. The CLI (plan.ts) and the page (app.ts) both call buildPlan().

import { parseIsoDate } from "./dates";
import { buildMessage } from "./messages";

export const STEPS = ["friendly", "firm", "final"] as const;
export type Step = (typeof STEPS)[number];

export type SkipReason =
  | "duplicate_id"
  | "invalid_amount"
  | "missing_due_date"
  | "invalid_due_date"
  | "invalid_paid_date";

export interface Action {
  invoice_id: string;
  step: Step;
  needs_approval: boolean;
  days_overdue: number;
  message: string;
}

export interface Skipped {
  invoice_id: string;
  reason: SkipReason;
}

export interface Plan {
  today: string;
  actions: Action[];
  skipped: Skipped[];
}

/** An invoice as read from JSON: only `id` is known to be a string. */
export type RawInvoice = Record<string, unknown> & { id: string };

interface StepRule {
  step: Step;
  minDays: number;
  needsApproval: boolean;
}

/** Highest step first, so the first match is the highest step reached. */
const STEP_RULES: StepRule[] = [
  { step: "final", minDays: 24, needsApproval: true },
  { step: "firm", minDays: 10, needsApproval: true },
  { step: "friendly", minDays: 3, needsApproval: false },
];

const STEP_RANK: Record<Step, number> = { friendly: 1, firm: 2, final: 3 };

function isStep(value: unknown): value is Step {
  return typeof value === "string" && (STEPS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Plain text order, character by character: "INV-100" < "INV-99". */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Invoices we can work with. Every invoice should have a text id; an entry that is
 * not an object or has no text id cannot be reported by id, so it is left out.
 */
export function usableInvoices(invoices: unknown[]): RawInvoice[] {
  return invoices.filter((inv): inv is RawInvoice => isRecord(inv) && typeof inv.id === "string");
}

/** Ids used by more than one invoice. */
export function findDuplicateIds(invoices: RawInvoice[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const inv of invoices) {
    if (seen.has(inv.id)) duplicates.add(inv.id);
    seen.add(inv.id);
  }
  return duplicates;
}

/** The first bad-data reason that applies to an invoice, or null if its data is fine. */
export function findSkipReason(
  inv: RawInvoice,
  todayDay: number,
  duplicateIds: Set<string>,
): SkipReason | null {
  if (duplicateIds.has(inv.id)) return "duplicate_id";

  const amount = inv.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return "invalid_amount";

  const due = inv.due_date;
  if (due === undefined || due === null || due === "") return "missing_due_date";
  if (parseIsoDate(due) === null) return "invalid_due_date";

  // Missing or null paid_date means unpaid; anything else must be a real date not after today.
  if ("paid_date" in inv && inv.paid_date !== null) {
    const paidDay = parseIsoDate(inv.paid_date);
    if (paidDay === null || paidDay > todayDay) return "invalid_paid_date";
  }
  return null;
}

/** The highest step reached after `daysOverdue` days, or null if none yet. */
export function stepFor(daysOverdue: number): StepRule | null {
  return STEP_RULES.find((rule) => daysOverdue >= rule.minDays) ?? null;
}

/**
 * Highest step already sent per invoice. Entries for unknown invoice ids or with an
 * unknown step are ignored.
 */
export function highestSentSteps(sent: unknown[], knownIds: Set<string>): Map<string, number> {
  const highest = new Map<string, number>();
  for (const entry of sent) {
    if (!isRecord(entry) || typeof entry.invoice_id !== "string") continue;
    if (!knownIds.has(entry.invoice_id) || !isStep(entry.step)) continue;
    const rank = STEP_RANK[entry.step];
    highest.set(entry.invoice_id, Math.max(rank, highest.get(entry.invoice_id) ?? 0));
  }
  return highest;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

/**
 * Return the plan for `today`.
 * invoices: the list from invoices.json
 * sent: the list from sent.json
 * today: a date string, YYYY-MM-DD (throws RangeError if it is not a real date)
 */
export function buildPlan(invoices: unknown[], sent: unknown[], today: string): Plan {
  const todayDay = parseIsoDate(today);
  if (todayDay === null) throw new RangeError(`"${today}" is not a valid date (YYYY-MM-DD)`);

  const usable = usableInvoices(invoices);
  const duplicateIds = findDuplicateIds(usable);
  const sentSteps = highestSentSteps(sent, new Set(usable.map((inv) => inv.id)));

  const actions: Action[] = [];
  const skipped: Skipped[] = [];
  const reportedDuplicates = new Set<string>();

  for (const inv of usable) {
    // 1. Bad data.
    const reason = findSkipReason(inv, todayDay, duplicateIds);
    if (reason !== null) {
      if (reason === "duplicate_id") {
        if (reportedDuplicates.has(inv.id)) continue;
        reportedDuplicates.add(inv.id);
      }
      skipped.push({ invoice_id: inv.id, reason });
      continue;
    }

    // 2. Paid (paid_date was checked above, so any value here is a valid past date).
    if (inv.paid_date !== undefined && inv.paid_date !== null) continue;

    // 3. Not yet.
    const dueDate = inv.due_date as string;
    const daysOverdue = todayDay - (parseIsoDate(dueDate) as number);
    const rule = stepFor(daysOverdue);
    if (rule === null) continue;

    // 4. One action at most: the highest step, unless it or a higher one was sent.
    if ((sentSteps.get(inv.id) ?? 0) >= STEP_RANK[rule.step]) continue;

    actions.push({
      invoice_id: inv.id,
      step: rule.step,
      needs_approval: rule.needsApproval,
      days_overdue: daysOverdue,
      message: buildMessage(rule.step, {
        customer: text(inv.customer),
        invoiceId: inv.id,
        dueDate,
        amount: inv.amount as number,
        currency: text(inv.currency),
        daysOverdue,
      }),
    });
  }

  actions.sort((a, b) => compareIds(a.invoice_id, b.invoice_id));
  skipped.sort((a, b) => compareIds(a.invoice_id, b.invoice_id));
  return { today, actions, skipped };
}
