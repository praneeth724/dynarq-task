// HTML for the owner's page (part 2). Pure functions: data in, HTML string out.
// Plain HTML forms and buttons, so everything works with the keyboard and with no
// JavaScript; one column on a phone.

import { formatAmount } from "./messages";
import type { Action, Plan, RawInvoice, SkipReason, Step } from "./rules";

export type Decision = "approved" | "rejected";

export interface PageInput {
  today: string;
  plan: Plan;
  invoices: Map<string, RawInvoice>;
  decisionFor: (action: Action) => Decision | undefined;
  /** The invoice id just decided, to confirm what was saved. */
  justDecided?: string;
}

export const STEP_LABEL: Record<Step, string> = {
  friendly: "Friendly reminder",
  firm: "Firm reminder",
  final: "Final notice",
};

/** Plain words for each skip reason: what is wrong and what to fix. */
export const REASON_TEXT: Record<SkipReason, string> = {
  duplicate_id: "More than one invoice uses this invoice number, so none of them were checked. Give each invoice its own number.",
  invalid_amount: "The amount is missing, is not a number, or is zero or less. Enter the amount owed.",
  missing_due_date: "The due date is missing. Add the date the invoice had to be paid.",
  invalid_due_date: "The due date is not a real date. Write it as year-month-day, for example 2026-09-30.",
  invalid_paid_date: "The paid date is not a real date, or it is later than today. Correct it, or leave it empty if the invoice is unpaid.",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A safe value for an HTML id and a URL fragment. */
export function anchorFor(invoiceId: string): string {
  return "invoice-" + invoiceId.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** "Monday 12 October 2026" for a valid YYYY-MM-DD date. */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const STYLE = `
:root{--bg:#f6f7f9;--card:#fff;--text:#1b1f24;--muted:#57606a;--line:#d0d7de;--accent:#0b57d0;
--ok-bg:#e6f4ea;--ok:#146c2e;--no-bg:#fce8e6;--no:#a50e0e;--warn-bg:#fff4e5;--warn:#8a4b00;--focus:#ffbf47}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:56rem;margin:0 auto;padding:1rem 1rem 3rem}
h1{font-size:1.6rem;margin:.5rem 0 0}
h2{font-size:1.25rem;margin:2rem 0 .25rem}
h3{font-size:1.05rem;margin:0}
p{margin:.25rem 0 .75rem}
.muted{color:var(--muted)}
.skip{position:absolute;left:-999px}.skip:focus{left:1rem;top:1rem;background:var(--card);padding:.5rem;z-index:1}
a{color:var(--accent)}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.summary{display:flex;flex-wrap:wrap;gap:.5rem;padding:0;margin:1rem 0;list-style:none}
.summary li{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:.25rem .75rem}
.cards{list-style:none;padding:0;margin:0;display:grid;gap:1rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:.75rem;padding:1rem}
.card header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.5rem;align-items:baseline}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.5rem 1rem;margin:.75rem 0}
.facts div{min-width:0}.facts dt{font-size:.8rem;color:var(--muted)}.facts dd{margin:0;font-weight:600;overflow-wrap:anywhere}
.step{font-size:.85rem;font-weight:600;border-radius:999px;padding:.1rem .6rem;background:#e8eefc;color:#0842a0}
.step-final{background:var(--no-bg);color:var(--no)}
.message{white-space:pre-wrap;overflow-wrap:anywhere;margin:.5rem 0 0;padding:.75rem;background:var(--bg);border-left:4px solid var(--line);border-radius:.25rem;font:inherit}
.status{font-weight:600;border-radius:.5rem;padding:.25rem .6rem;display:inline-block}
.status-waiting{background:var(--warn-bg);color:var(--warn)}
.status-approved{background:var(--ok-bg);color:var(--ok)}
.status-rejected{background:var(--no-bg);color:var(--no)}
.decide{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.75rem}
button{font:inherit;font-weight:600;min-height:44px;padding:.5rem 1.1rem;border-radius:.5rem;border:2px solid currentColor;background:var(--card);cursor:pointer}
button.approve{color:var(--ok)}button.reject{color:var(--no)}
button[aria-pressed="true"].approve{background:var(--ok);color:#fff;border-color:var(--ok)}
button[aria-pressed="true"].reject{background:var(--no);color:#fff;border-color:var(--no)}
.notice{background:var(--card);border:1px solid var(--line);border-left:6px solid var(--accent);border-radius:.5rem;padding:1rem;margin:1rem 0}
.notice-error{border-left-color:var(--no)}
.notice-ok{border-left-color:var(--ok)}
.skipped .reason{margin:.25rem 0 0}
@media (max-width:30rem){h1{font-size:1.35rem}.decide button{flex:1 1 8rem}}
`;

function layout(title: string, body: string): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body>` +
    '<a class="skip" href="#main">Skip to content</a>' +
    `<main id="main">${body}</main></body></html>`
  );
}

function invoiceFacts(action: Action, invoice: RawInvoice | undefined): string {
  const amount =
    invoice && typeof invoice.amount === "number" ? formatAmount(invoice.amount, String(invoice.currency ?? "")) : "";
  const fact = (label: string, value: string) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`;
  return (
    '<dl class="facts">' +
    fact("Invoice", action.invoice_id) +
    fact("Amount", amount) +
    fact("Due date", String(invoice?.due_date ?? "")) +
    fact("Days overdue", String(action.days_overdue)) +
    "</dl>"
  );
}

function decisionStatus(decision: Decision | undefined): string {
  if (decision === "approved") return '<span class="status status-approved">You approved this reminder</span>';
  if (decision === "rejected") return '<span class="status status-rejected">You rejected this reminder</span>';
  return '<span class="status status-waiting">Waiting for your decision</span>';
}

function decisionForm(action: Action, decision: Decision | undefined, customer: string): string {
  const button = (value: Decision, label: string) =>
    `<button type="submit" name="decision" value="${value}" class="${value === "approved" ? "approve" : "reject"}" ` +
    `aria-pressed="${decision === value}" aria-label="${label} the ${STEP_LABEL[action.step].toLowerCase()} for ${escapeHtml(customer)}, invoice ${escapeHtml(action.invoice_id)}">` +
    `${label}</button>`;
  return (
    '<form method="post" action="/decision" class="decide">' +
    `<input type="hidden" name="invoice_id" value="${escapeHtml(action.invoice_id)}">` +
    `<input type="hidden" name="step" value="${action.step}">` +
    button("approved", "Approve") +
    button("rejected", "Reject") +
    "</form>"
  );
}

function actionCard(action: Action, input: PageInput): string {
  const invoice = input.invoices.get(action.invoice_id);
  const customer = String(invoice?.customer ?? action.invoice_id);
  const decision = input.decisionFor(action);
  const headingId = `${anchorFor(action.invoice_id)}-title`;
  return (
    `<li class="card" id="${anchorFor(action.invoice_id)}" tabindex="-1" aria-labelledby="${headingId}">` +
    `<header><h3 id="${headingId}">${escapeHtml(customer)}</h3>` +
    `<span class="step step-${action.step}">${STEP_LABEL[action.step]}</span></header>` +
    invoiceFacts(action, invoice) +
    (action.needs_approval
      ? decisionStatus(decision) + decisionForm(action, decision, customer)
      : '<p class="muted">No approval needed.</p>') +
    `<p class="muted" style="margin:.75rem 0 0">Email to the customer:</p>` +
    `<pre class="message">${escapeHtml(action.message)}</pre>` +
    "</li>"
  );
}

function skippedSection(input: PageInput): string {
  const { skipped } = input.plan;
  if (skipped.length === 0) return "";
  const items = skipped
    .map((s) => {
      const invoice = input.invoices.get(s.invoice_id);
      const customer = invoice && typeof invoice.customer === "string" ? ` · ${escapeHtml(invoice.customer)}` : "";
      return (
        '<li class="card">' +
        `<h3>Invoice ${escapeHtml(s.invoice_id)}<span class="muted" style="font-weight:400">${customer}</span></h3>` +
        `<p class="reason">${escapeHtml(REASON_TEXT[s.reason])}</p></li>`
      );
    })
    .join("");
  return (
    '<section class="skipped" aria-labelledby="skipped-title">' +
    '<h2 id="skipped-title">Could not be checked</h2>' +
    '<p class="muted">These invoices have wrong or missing data, so no reminder was planned. Fix the data and they will be checked again.</p>' +
    `<ul class="cards">${items}</ul></section>`
  );
}

function confirmation(input: PageInput): string {
  if (!input.justDecided) return '<div role="status"></div>';
  const action = input.plan.actions.find((a) => a.invoice_id === input.justDecided);
  const decision = action && input.decisionFor(action);
  if (!action || !decision) return '<div role="status"></div>';
  const customer = String(input.invoices.get(action.invoice_id)?.customer ?? "");
  return (
    `<div role="status" class="notice notice-ok">Saved: you ${decision} the ${STEP_LABEL[action.step].toLowerCase()} ` +
    `for ${escapeHtml(customer)} (invoice ${escapeHtml(action.invoice_id)}). Nothing has been sent.</div>`
  );
}

export function renderPlanPage(input: PageInput): string {
  const { plan } = input;
  const approval = plan.actions.filter((a) => a.needs_approval);
  const automatic = plan.actions.filter((a) => !a.needs_approval);
  const waiting = approval.filter((a) => input.decisionFor(a) === undefined).length;

  let body =
    "<h1>Payment reminders</h1>" +
    `<p class="muted">Plan for <time datetime="${escapeHtml(plan.today)}">${escapeHtml(longDate(plan.today))}</time>. ` +
    "This page only records your decisions; no email is sent from here.</p>" +
    confirmation(input);

  if (plan.actions.length === 0 && plan.skipped.length === 0) {
    body +=
      '<div class="notice notice-ok"><h2 style="margin-top:0">Nothing to do today</h2>' +
      "<p>No invoice needs a reminder today, and all invoice data could be checked. " +
      "Reminders start 3 days after an invoice's due date.</p></div>";
    return layout("Payment reminders: nothing to do", body);
  }

  body +=
    '<ul class="summary" aria-label="Summary">' +
    `<li>${plural(approval.length, "reminder needs", "reminders need")} approval (${waiting} waiting)</li>` +
    `<li>${plural(automatic.length, "friendly reminder", "friendly reminders")} ready</li>` +
    `<li>${plural(plan.skipped.length, "invoice", "invoices")} could not be checked</li></ul>`;

  if (plan.actions.length === 0) {
    body +=
      '<div class="notice"><h2 style="margin-top:0">No reminders today</h2>' +
      "<p>No invoice needs a reminder today. Some invoices could not be checked; see below.</p></div>";
  }

  if (approval.length > 0) {
    body +=
      '<section aria-labelledby="approval-title"><h2 id="approval-title">Needs your approval</h2>' +
      '<p class="muted">Firm reminders and final notices are only sent after you approve them.</p>' +
      `<ul class="cards">${approval.map((a) => actionCard(a, input)).join("")}</ul></section>`;
  }
  if (automatic.length > 0) {
    body +=
      '<section aria-labelledby="ready-title"><h2 id="ready-title">Friendly reminders</h2>' +
      '<p class="muted">These do not need your approval.</p>' +
      `<ul class="cards">${automatic.map((a) => actionCard(a, input)).join("")}</ul></section>`;
  }
  body += skippedSection(input);
  return layout(`Payment reminders: ${plan.actions.length} today`, body);
}

/** The page shown when the data or the date cannot be used. */
export function renderErrorPage(title: string, detail: string, help: string): string {
  return layout(
    `Payment reminders: ${title}`,
    "<h1>Payment reminders</h1>" +
      `<div class="notice notice-error" role="alert"><h2 style="margin-top:0">${escapeHtml(title)}</h2>` +
      `<p>${escapeHtml(detail)}</p><p>${escapeHtml(help)}</p></div>` +
      '<p><a href="/">Try again</a></p>',
  );
}
