// Starts the real server on a free port and talks to it over HTTP.

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app";

const SAMPLE_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const servers: { close: () => void }[] = [];
after(() => servers.forEach((s) => s.close()));

async function start(dataDir: string, today = "2026-10-12"): Promise<string> {
  const server = createApp({ dataDir, today: () => today });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function dataDir(invoices: unknown, sent: unknown = []): string {
  const dir = mkdtempSync(join(tmpdir(), "app-test-"));
  writeFileSync(join(dir, "invoices.json"), typeof invoices === "string" ? invoices : JSON.stringify(invoices));
  writeFileSync(join(dir, "sent.json"), JSON.stringify(sent));
  return dir;
}

function post(base: string, fields: Record<string, string>): Promise<Response> {
  return fetch(`${base}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

test("shows today's plan with every field and plain-word skip reasons", async () => {
  const base = await start(SAMPLE_DIR);
  const res = await fetch(base + "/");
  assert.equal(res.status, 200);
  const html = await res.text();
  for (const text of [
    "Alder Fabrication Ltd", "INV-1001", "EUR 1250.00", "Firm reminder", "Final notice", "Friendly reminder",
    "Driftwood Logistics GmbH", "USD 845.25", "Our records show", "Waiting for your decision",
    "The due date is not a real date", "The due date is missing", "More than one invoice uses this invoice number",
    "Monday 12 October 2026",
  ]) {
    assert.ok(html.includes(text), `page is missing ${text}`);
  }
  assert.ok(!html.includes("invalid_due_date"), "reason codes must not be shown");
  assert.match(html, /<meta name="viewport"/);
  // Friendly reminders have no approve/reject buttons: 4 approval actions → 8 buttons.
  assert.equal(html.match(/name="decision"/g)?.length, 8);
});

test("approving and rejecting records and shows the decision", async () => {
  const base = await start(SAMPLE_DIR);
  const res = await post(base, { invoice_id: "INV-1001", step: "firm", decision: "approved" });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/?saved=INV-1001#invoice-INV-1001");

  let html = await (await fetch(base + "/?saved=INV-1001")).text();
  assert.ok(html.includes("You approved this reminder"));
  assert.ok(html.includes("Saved: you approved the firm reminder for Alder Fabrication Ltd"));
  assert.ok(html.includes("3 waiting"));

  await post(base, { invoice_id: "INV-1001", step: "firm", decision: "rejected" });
  await post(base, { invoice_id: "INV-1004", step: "final", decision: "rejected" });
  html = await (await fetch(base + "/")).text();
  assert.equal(html.match(/You rejected this reminder/g)?.length, 2);
  assert.ok(!html.includes("You approved this reminder"));
});

test("decisions are only accepted for reminders that need approval today", async () => {
  const base = await start(SAMPLE_DIR);
  const cases = [
    { invoice_id: "INV-1002", step: "friendly", decision: "approved" }, // no approval needed
    { invoice_id: "INV-1001", step: "final", decision: "approved" }, // wrong step
    { invoice_id: "INV-9999", step: "firm", decision: "approved" }, // unknown invoice
    { invoice_id: "INV-1001", step: "firm", decision: "maybe" }, // unknown decision
  ];
  for (const fields of cases) {
    const res = await post(base, fields);
    assert.equal(res.status, 400, JSON.stringify(fields));
    assert.ok((await res.text()).includes("could not be saved"));
  }
});

test("explains when there is nothing to do", async () => {
  const base = await start(dataDir([]));
  const html = await (await fetch(base + "/")).text();
  assert.ok(html.includes("Nothing to do today"));
});

test("explains when there are no reminders but some invoices could not be checked", async () => {
  const dir = dataDir([{ id: "A", customer: "X", currency: "EUR", amount: 0, due_date: "2026-10-01" }]);
  const html = await (await fetch((await start(dir)) + "/")).text();
  assert.ok(html.includes("No reminders today"));
  assert.ok(html.includes("The amount is missing, is not a number, or is zero or less"));
});

test("explains when the data cannot be read", async () => {
  for (const dir of [join(tmpdir(), "no-such-folder-for-tests"), dataDir("{ broken"), dataDir({ not: "a list" })]) {
    const res = await fetch((await start(dir)) + "/");
    assert.equal(res.status, 500);
    const html = await res.text();
    assert.ok(html.includes("The invoice data could not be read"));
    assert.ok(html.includes("DATA_DIR"));
  }
});

test("explains when TODAY is not a valid date", async () => {
  const res = await fetch((await start(SAMPLE_DIR, "2026-02-30")) + "/");
  assert.equal(res.status, 500);
  assert.ok((await res.text()).includes("The date is not valid"));
});

test("escapes data from the files", async () => {
  const dir = dataDir([{ id: "X<1>", customer: "<script>alert(1)</script>", currency: "EUR", amount: 5, due_date: "2026-10-01" }]);
  const html = await (await fetch((await start(dir)) + "/")).text();
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("unknown pages give 404", async () => {
  const res = await fetch((await start(SAMPLE_DIR)) + "/nope");
  assert.equal(res.status, 404);
});
