// Runs the real command in a child process, as the markers will.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA = fileURLToPath(new URL("../../data/", import.meta.url));
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

function runPlan(args: string[]) {
  return spawnSync(process.execPath, [TSX, "src/plan.ts", ...args], { cwd: ROOT, encoding: "utf-8" });
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "plan-test-"));
}

test("writes the plan and exits 0", () => {
  const out = join(tempDir(), "actions.json");
  const r = runPlan(["--invoices", DATA + "invoices.json", "--sent", DATA + "sent.json", "--today", "2026-10-12", "--out", out]);
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(readFileSync(out, "utf-8"));
  assert.deepEqual(Object.keys(plan), ["today", "actions", "skipped"]);
  assert.equal(plan.today, "2026-10-12");
  assert.equal(plan.actions.length, 5);
  assert.equal(plan.skipped.length, 3);
});

test("an invalid --today gives a clear message and a non zero exit", () => {
  for (const today of ["2026-02-30", "12/10/2026", "today"]) {
    const r = runPlan(["--invoices", DATA + "invoices.json", "--sent", DATA + "sent.json", "--today", today, "--out", join(tempDir(), "a.json")]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /not a valid date/);
  }
});

test("a file that cannot be read gives a clear message and a non zero exit", () => {
  const dir = tempDir();
  const broken = join(dir, "broken.json");
  writeFileSync(broken, "{ not json");
  const notList = join(dir, "object.json");
  writeFileSync(notList, '{"id": "INV-1"}');
  const cases: [string, RegExp][] = [
    [join(dir, "missing.json"), /does not exist/],
    [broken, /not valid JSON/],
    [notList, /must contain a JSON list/],
  ];
  for (const [file, message] of cases) {
    const r = runPlan(["--invoices", file, "--sent", DATA + "sent.json", "--today", "2026-10-12", "--out", join(dir, "a.json")]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, message);
  }
  const r = runPlan(["--invoices", DATA + "invoices.json", "--sent", join(dir, "missing.json"), "--today", "2026-10-12", "--out", join(dir, "a.json")]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /sent reminders file/);
});

test("missing arguments print usage and exit non zero", () => {
  const r = runPlan(["--today", "2026-10-12"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Usage/);
});
