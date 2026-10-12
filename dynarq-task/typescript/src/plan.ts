// Payment reminder command (part 1). The rules live in rules.ts.
//
// Run from inside typescript/ (after npm install):
//
//   npm run plan -- --invoices ../data/invoices.json --sent ../data/sent.json --today 2026-10-12 --out ../actions.json
//
// Exit codes: 0 plan written, 1 a file cannot be read or written, 2 bad arguments.

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { DataError, loadData } from "./data";
import { isIsoDate } from "./dates";
import { buildPlan } from "./rules";

export { buildPlan } from "./rules";
export type { Action, Plan, Skipped, SkipReason, Step } from "./rules";

const USAGE = "Usage: npm run plan -- --invoices FILE --sent FILE --today YYYY-MM-DD --out FILE";

/** Run the command with `args` (without node and script). Returns the exit code. */
export function run(args: string[]): number {
  let values: Record<string, string | undefined>;
  try {
    values = parseArgs({
      args,
      options: {
        invoices: { type: "string" },
        sent: { type: "string" },
        today: { type: "string" },
        out: { type: "string" },
      },
    }).values;
  } catch (err) {
    console.error(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }

  const { invoices, sent, today, out } = values;
  if (!invoices || !sent || !today || !out) {
    console.error(USAGE);
    return 2;
  }
  if (!isIsoDate(today)) {
    console.error(`--today "${today}" is not a valid date. Use a real date as YYYY-MM-DD, for example 2026-10-12.`);
    return 2;
  }

  let data;
  try {
    data = loadData(invoices, sent);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    console.error(err.message);
    return 1;
  }

  const plan = buildPlan(data.invoices, data.sent, today);
  try {
    writeFileSync(out, JSON.stringify(plan, null, 2) + "\n", "utf-8");
  } catch (err) {
    console.error(`Cannot write the plan to ${out}: ${(err as Error).message}`);
    return 1;
  }
  console.log(`Wrote ${plan.actions.length} action(s) and ${plan.skipped.length} skipped invoice(s) to ${out}`);
  return 0;
}

// Run only when this file is started directly, not when a test imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run(process.argv.slice(2));
}
