import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readJsonList } from "../src/data";
import { buildPlan, compareIds } from "../src/rules";

const TODAY = "2026-10-12";

/** A valid unpaid invoice, `days` days overdue on TODAY, with optional overrides. */
function inv(id: string, days: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const due = new Date(Date.UTC(2026, 9, 12 - days)).toISOString().slice(0, 10);
  return { id, customer: `Customer ${id}`, email: "a@b.test", amount: 100, currency: "EUR", due_date: due, paid_date: null, ...extra };
}

function plan(invoices: unknown[], sent: unknown[] = []) {
  return buildPlan(invoices, sent, TODAY);
}

function steps(invoices: unknown[], sent: unknown[] = []) {
  return plan(invoices, sent).actions.map((a) => [a.invoice_id, a.step, a.needs_approval, a.days_overdue]);
}

function reasons(invoices: unknown[]) {
  return plan(invoices).skipped.map((s) => [s.invoice_id, s.reason]);
}

// --- Days overdue and step boundaries -------------------------------------------

test("step boundaries: 2/3, 9/10 and 23/24 days", () => {
  assert.deepEqual(steps([inv("A", 2), inv("B", 3), inv("C", 9), inv("D", 10), inv("E", 23), inv("F", 24)]), [
    ["B", "friendly", false, 3],
    ["C", "friendly", false, 9],
    ["D", "firm", true, 10],
    ["E", "firm", true, 23],
    ["F", "final", true, 24],
  ]);
});

test("due today, not yet due, and far overdue", () => {
  assert.deepEqual(steps([inv("A", 0), inv("B", -5), inv("C", 400)]), [["C", "final", true, 400]]);
});

test("days overdue counts calendar days across a month end", () => {
  const p = buildPlan([inv("A", 0, { due_date: "2026-09-30" })], [], "2026-10-12");
  assert.equal(p.actions[0].days_overdue, 12);
});

// --- One action at most ----------------------------------------------------------

test("plans only the highest step reached, not lower ones too", () => {
  assert.deepEqual(steps([inv("A", 12)]), [["A", "firm", true, 12]]);
  assert.deepEqual(steps([inv("A", 30)]), [["A", "final", true, 30]]);
});

test("nothing when that step or a higher one was already sent", () => {
  const sent = [
    { invoice_id: "A", step: "firm" },
    { invoice_id: "B", step: "final" },
    { invoice_id: "C", step: "final" },
  ];
  assert.deepEqual(steps([inv("A", 12), inv("B", 12), inv("C", 4)], sent), []);
});

test("a lower step already sent does not stop a higher one", () => {
  const sent = [{ invoice_id: "A", step: "friendly" }, { invoice_id: "B", step: "firm" }];
  assert.deepEqual(steps([inv("A", 12), inv("B", 30)], sent), [
    ["A", "firm", true, 12],
    ["B", "final", true, 30],
  ]);
});

test("sent entries with unknown ids, unknown steps or bad shapes are ignored", () => {
  const sent = [
    { invoice_id: "OTHER", step: "final" },
    { invoice_id: "A", step: "FIRM" },
    { invoice_id: "A", step: "reminder" },
    { invoice_id: "A" },
    { step: "final" },
    null,
    "A",
    42,
  ];
  assert.deepEqual(steps([inv("A", 12)], sent), [["A", "firm", true, 12]]);
});

test("sent_on is not used by the rules", () => {
  const sent = [{ invoice_id: "A", step: "friendly", sent_on: "2030-01-01" }];
  assert.deepEqual(steps([inv("A", 5)], sent), []);
});

// --- Paid -----------------------------------------------------------------------

test("paid invoices plan nothing, even with earlier reminders", () => {
  const invoices = [
    inv("A", 30, { paid_date: "2026-10-01" }),
    inv("B", 30, { paid_date: TODAY }),
    inv("C", 30, { paid_date: "2026-09-01" }), // paid before it was due
  ];
  assert.deepEqual(plan(invoices, [{ invoice_id: "A", step: "friendly" }]), { today: TODAY, actions: [], skipped: [] });
});

test("missing or null paid_date means unpaid", () => {
  const noKey = inv("A", 5);
  delete noKey.paid_date;
  assert.deepEqual(steps([noKey, inv("B", 5, { paid_date: null })]), [
    ["A", "friendly", false, 5],
    ["B", "friendly", false, 5],
  ]);
});

// --- Bad data -------------------------------------------------------------------

test("invalid_amount: missing, not a number, zero or negative", () => {
  const noAmount = inv("A1", 5);
  delete noAmount.amount;
  const invoices = [
    noAmount,
    inv("A2", 5, { amount: "100" }),
    inv("A3", 5, { amount: true }),
    inv("A4", 5, { amount: null }),
    inv("A5", 5, { amount: 0 }),
    inv("A6", 5, { amount: -10 }),
    inv("A7", 5, { amount: [100] }),
  ];
  assert.deepEqual(reasons(invoices), invoices.map((i) => [i.id, "invalid_amount"]));
});

test("small positive amounts are fine", () => {
  assert.equal(steps([inv("A", 5, { amount: 0.01 })]).length, 1);
});

test("missing_due_date: missing, null or empty string", () => {
  const noDue = inv("D1", 5);
  delete noDue.due_date;
  assert.deepEqual(reasons([noDue, inv("D2", 5, { due_date: null }), inv("D3", 5, { due_date: "" })]), [
    ["D1", "missing_due_date"],
    ["D2", "missing_due_date"],
    ["D3", "missing_due_date"],
  ]);
});

test("invalid_due_date: not a real YYYY-MM-DD date", () => {
  const invoices = [
    inv("E1", 5, { due_date: "2026-02-30" }),
    inv("E2", 5, { due_date: "30/09/2026" }),
    inv("E3", 5, { due_date: 20260930 }),
    inv("E4", 5, { due_date: "2026-9-30" }),
  ];
  assert.deepEqual(reasons(invoices), invoices.map((i) => [i.id, "invalid_due_date"]));
});

test("invalid_paid_date: empty string, bad date, wrong type, or after today", () => {
  const invoices = [
    inv("P1", 5, { paid_date: "" }),
    inv("P2", 5, { paid_date: "2026-02-30" }),
    inv("P3", 5, { paid_date: "2026-10-13" }),
    inv("P4", 5, { paid_date: false }),
    inv("P5", 5, { paid_date: "12/10/2026" }),
  ];
  assert.deepEqual(reasons(invoices), invoices.map((i) => [i.id, "invalid_paid_date"]));
});

test("invalid_paid_date applies even when the invoice is not yet due", () => {
  assert.deepEqual(reasons([inv("A", -10, { paid_date: "" })]), [["A", "invalid_paid_date"]]);
});

test("the first reason that applies wins", () => {
  const invoices = [
    inv("R1", 5, { amount: 0, due_date: null, paid_date: "" }),
    inv("R2", 5, { due_date: null, paid_date: "" }),
    inv("R3", 5, { due_date: "2026-02-30", paid_date: "" }),
  ];
  assert.deepEqual(reasons(invoices), [
    ["R1", "invalid_amount"],
    ["R2", "missing_due_date"],
    ["R3", "invalid_due_date"],
  ]);
});

test("duplicate_id: every copy is skipped, the id listed once, before any other reason", () => {
  const invoices = [inv("D", 5), inv("D", 30), inv("D", 5, { amount: -1 }), inv("OK", 5)];
  const p = plan(invoices);
  assert.deepEqual(p.skipped, [{ invoice_id: "D", reason: "duplicate_id" }]);
  assert.deepEqual(p.actions.map((a) => a.invoice_id), ["OK"]);
});

test("sent entries for a duplicate id do not matter", () => {
  const p = plan([inv("D", 5), inv("D", 5)], [{ invoice_id: "D", step: "friendly" }]);
  assert.deepEqual(p, { today: TODAY, actions: [], skipped: [{ invoice_id: "D", reason: "duplicate_id" }] });
});

test("entries that are not objects or have no text id are left out", () => {
  const noId = inv("x", 5);
  delete noId.id;
  assert.deepEqual(plan([null, 5, "INV-1", [], noId, inv("A", 5, { id: 7 })]), { today: TODAY, actions: [], skipped: [] });
});

// --- Output -----------------------------------------------------------------------

test("both lists are sorted by id in plain character order", () => {
  const invoices = [inv("INV-99", 5), inv("INV-100", 5), inv("inv-1", 5), inv("INV-2", 5, { amount: 0 }), inv("INV-10", 5, { amount: 0 })];
  const p = plan(invoices);
  assert.deepEqual(p.actions.map((a) => a.invoice_id), ["INV-100", "INV-99", "inv-1"]);
  assert.deepEqual(p.skipped.map((s) => s.invoice_id), ["INV-10", "INV-2"]);
  assert.equal(compareIds("INV-100", "INV-99"), -1);
});

test("actions have exactly the required fields, in order", () => {
  const [action] = plan([inv("A", 12)]).actions;
  assert.deepEqual(Object.keys(action), ["invoice_id", "step", "needs_approval", "days_overdue", "message"]);
  assert.equal(typeof action.message, "string");
});

test("an invalid today is rejected", () => {
  assert.throws(() => buildPlan([], [], "2026-02-30"), RangeError);
  assert.throws(() => buildPlan([], [], "12/10/2026"), RangeError);
});

test("the sample data gives the expected plan", () => {
  const dataDir = fileURLToPath(new URL("../../data/", import.meta.url));
  const p = buildPlan(readJsonList(dataDir + "invoices.json", "invoices"), readJsonList(dataDir + "sent.json", "sent"), TODAY);
  assert.deepEqual(
    p.actions.map((a) => [a.invoice_id, a.step, a.needs_approval, a.days_overdue]),
    [
      ["INV-1001", "firm", true, 12],
      ["INV-1002", "friendly", false, 3],
      ["INV-1004", "final", true, 32],
      ["INV-1009", "firm", true, 12],
      ["INV-1011", "firm", true, 10],
    ],
  );
  assert.deepEqual(p.skipped, [
    { invoice_id: "INV-1007", reason: "invalid_due_date" },
    { invoice_id: "INV-1008", reason: "missing_due_date" },
    { invoice_id: "INV-1010", reason: "duplicate_id" },
  ]);
});
