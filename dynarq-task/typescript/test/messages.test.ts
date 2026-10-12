import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMessage, checkMessage, formatAmount, type MessageFacts } from "../src/messages";
import { STEPS } from "../src/rules";

const FACTS: MessageFacts = {
  customer: "Alder Fabrication Ltd",
  invoiceId: "INV-1001",
  dueDate: "2026-09-30",
  amount: 1250,
  currency: "EUR",
  daysOverdue: 12,
};

test("formatAmount uses the currency and 2 decimals", () => {
  assert.equal(formatAmount(1250, "EUR"), "EUR 1250.00");
  assert.equal(formatAmount(215.5, "EUR"), "EUR 215.50");
  assert.equal(formatAmount(845.25, "USD"), "USD 845.25");
  assert.equal(formatAmount(0.1 + 0.2, "EUR"), "EUR 0.30");
});

for (const step of STEPS) {
  test(`${step} message contains every required fact and nothing else`, () => {
    const text = buildMessage(step, FACTS);
    assert.deepEqual(checkMessage(text, FACTS), []);
    for (const part of ["Alder Fabrication Ltd", "INV-1001", "2026-09-30", "EUR 1250.00", "12 days"]) {
      assert.ok(text.includes(part), `${step} is missing ${part}`);
    }
  });

  test(`${step} message stays valid for awkward data`, () => {
    const facts: MessageFacts = { customer: "Route 66 Diner & Co <b>", invoiceId: "2026/77", dueDate: "2024-02-29", amount: 9.999, currency: "GBP", daysOverdue: 400 };
    assert.deepEqual(checkMessage(buildMessage(step, facts), facts), []);
  });
}

test("each step has its own tone", () => {
  const [friendly, firm, final] = STEPS.map((s) => buildMessage(s, FACTS));
  assert.match(friendly, /friendly/i);
  assert.match(final, /final notice/i);
  assert.notEqual(friendly, firm);
  assert.notEqual(firm, final);
});

test("checkMessage catches missing facts", () => {
  const problems = checkMessage("Dear someone, please pay.", FACTS);
  assert.deepEqual(problems, [
    "customer name missing",
    "invoice id missing",
    "due date missing",
    "amount with currency missing",
    "days overdue missing",
  ]);
});

test("checkMessage catches extra figures and made-up claims", () => {
  const good = buildMessage("final", FACTS);
  const bad = [
    good + " A late fee of 25 EUR will be added.",
    good + " Interest is charged at the ECB rate.",
    good + " Please pay within 7 days.",
    good + " This is our second reminder.",
    good + " As in our previous email.",
    good + " Pay by 2026-10-20.",
  ];
  for (const text of bad) assert.notDeepEqual(checkMessage(text, FACTS), [], text);
});

test("checkMessage accepts the grouped amount format", () => {
  const text = "Dear Alder Fabrication Ltd, invoice INV-1001 for EUR 1,250.00 due 2026-09-30 is 12 days overdue.";
  assert.deepEqual(checkMessage(text, FACTS), []);
});
