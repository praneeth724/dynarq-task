// Reminder messages (part 3).
//
// Messages come from fixed templates, so they work with no key and no internet and
// are always the same for the same input. Each template uses only figures from the
// invoice: customer, invoice id, due date, amount with currency, and days overdue.
// checkMessage() enforces those rules and is run on every message we produce.

import type { Step } from "./rules";

export interface MessageFacts {
  customer: string;
  invoiceId: string;
  dueDate: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  daysOverdue: number;
}

/** "EUR 1250.00": currency code, a space, the amount with exactly 2 decimals. */
export function formatAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

function dayWord(days: number): string {
  return days === 1 ? "day" : "days";
}

const TEMPLATES: Record<Step, (f: MessageFacts, amount: string) => string> = {
  friendly: (f, amount) =>
    `Dear ${f.customer},\n\n` +
    `This is a friendly note that invoice ${f.invoiceId} for ${amount}, due on ${f.dueDate}, ` +
    `is now ${f.daysOverdue} ${dayWord(f.daysOverdue)} overdue.\n\n` +
    `If you have already paid, thank you and please ignore this message. ` +
    `Otherwise we would be grateful if you could arrange payment when you can.\n\n` +
    `Kind regards`,
  firm: (f, amount) =>
    `Dear ${f.customer},\n\n` +
    `Our records show that invoice ${f.invoiceId} for ${amount}, due on ${f.dueDate}, ` +
    `is still unpaid and is now ${f.daysOverdue} ${dayWord(f.daysOverdue)} overdue.\n\n` +
    `Please arrange payment promptly. If there is a problem with this invoice, ` +
    `please contact us so we can resolve it.\n\n` +
    `Regards`,
  final: (f, amount) =>
    `Dear ${f.customer},\n\n` +
    `Final notice: invoice ${f.invoiceId} for ${amount}, due on ${f.dueDate}, ` +
    `is now ${f.daysOverdue} ${dayWord(f.daysOverdue)} overdue and remains unpaid.\n\n` +
    `Please pay the full amount without further delay. If there is a reason this ` +
    `invoice cannot be paid, contact us immediately.\n\n` +
    `Regards`,
};

/**
 * Words that would add a claim that is not in the invoice data: money on top of
 * the amount, made-up deadlines, or a mention of earlier reminders.
 */
const FORBIDDEN = [
  /\bfees?\b/i,
  /\binterest\b/i,
  /\bpenalt(y|ies)\b/i,
  /\bsurcharge/i,
  /\bcompensation\b/i,
  /\bdeadline\b/i,
  /\bwithin\b/i,
  /\bby (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)\b/i,
  /\b(previous|earlier|last|second|third|another)\b/i,
  /\breminders?\b/i,
  /\bagain\b/i,
  /%/,
];

/**
 * Return the list of problems with `text` (empty when it is fine): every required
 * fact must be present, and no other figure or forbidden claim may appear.
 */
export function checkMessage(text: string, facts: MessageFacts): string[] {
  const problems: string[] = [];
  const plainAmount = formatAmount(facts.amount, facts.currency);
  const groupedAmount =
    `${facts.currency} ` +
    facts.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amountText = text.includes(plainAmount) ? plainAmount : text.includes(groupedAmount) ? groupedAmount : null;

  if (!text.includes(facts.customer)) problems.push("customer name missing");
  if (!text.includes(facts.invoiceId)) problems.push("invoice id missing");
  if (!text.includes(facts.dueDate)) problems.push("due date missing");
  if (amountText === null) problems.push("amount with currency missing");
  const daysPattern = new RegExp(`(^|\\D)${facts.daysOverdue}\\s+days?\\b`);
  if (!daysPattern.test(text)) problems.push("days overdue missing");

  // Remove every allowed figure; any digit left over is a figure we did not allow.
  let rest = text;
  for (const allowed of [facts.customer, facts.invoiceId, facts.dueDate, amountText ?? plainAmount]) {
    if (allowed !== "") rest = rest.split(allowed).join(" ");
  }
  rest = rest.replace(daysPattern, "$1 days");
  if (/\d/.test(rest)) problems.push("contains a figure that is not in the invoice data");

  for (const pattern of FORBIDDEN) {
    if (pattern.test(rest)) problems.push(`contains forbidden wording (${pattern.source})`);
  }
  return problems;
}

/**
 * The email text for one action. The templates are checked against checkMessage()
 * in the tests; this never throws, so odd data cannot stop the whole plan.
 */
export function buildMessage(step: Step, facts: MessageFacts): string {
  return TEMPLATES[step](facts, formatAmount(facts.amount, facts.currency));
}
