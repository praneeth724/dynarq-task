// The owner's page (part 2). Uses only node:http, no framework needed.
//
// Run from inside typescript/:  npm run app
//
// Environment variables:
//   PORT      port to listen on, default 8000
//   DATA_DIR  folder with invoices.json and sent.json, default ../data
//   TODAY     date as YYYY-MM-DD, default the real date
//
// The plan is built fresh from the files on every request with buildPlan() from
// rules.ts. Decisions are kept in memory while the app runs, keyed by invoice and
// step, so a decision on a firm reminder does not carry over to a later final notice.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DataError, loadData } from "./data";
import { isIsoDate, localToday } from "./dates";
import { buildPlan, usableInvoices, type Action, type Plan, type RawInvoice } from "./rules";
import { anchorFor, renderErrorPage, renderPlanPage, type Decision } from "./page";

export interface AppConfig {
  dataDir: string;
  /** Returns today's date; called on every request so the date can roll over. */
  today: () => string;
}

const MAX_BODY_BYTES = 10_000;

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

type Loaded =
  | { ok: true; today: string; plan: Plan; invoices: Map<string, RawInvoice> }
  | { ok: false; status: number; title: string; detail: string; help: string };

function loadPlan(config: AppConfig): Loaded {
  const today = config.today();
  if (!isIsoDate(today)) {
    return {
      ok: false, status: 500, title: "The date is not valid",
      detail: `TODAY is set to "${today}", which is not a real date.`,
      help: "Set TODAY as year-month-day, for example 2026-10-12, or leave it out to use the real date.",
    };
  }
  try {
    const data = loadData(join(config.dataDir, "invoices.json"), join(config.dataDir, "sent.json"));
    const invoices = new Map<string, RawInvoice>();
    for (const inv of usableInvoices(data.invoices)) if (!invoices.has(inv.id)) invoices.set(inv.id, inv);
    return { ok: true, today, plan: buildPlan(data.invoices, data.sent, today), invoices };
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    return {
      ok: false, status: 500, title: "The invoice data could not be read",
      detail: err.message,
      help: `No plan can be made until this is fixed. Check that the folder ${config.dataDir} (DATA_DIR) contains invoices.json and sent.json, and that both are valid JSON lists.`,
    };
  }
}

function send(res: ServerResponse, status: number, html: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS, ...headers });
  res.end(html);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

export function createApp(config: AppConfig): Server {
  const decisions = new Map<string, Decision>();
  const keyFor = (invoiceId: string, step: string) => JSON.stringify([invoiceId, step]);
  const decisionFor = (action: Action) => decisions.get(keyFor(action.invoice_id, action.step));

  function showPlan(res: ServerResponse, url: URL, head: boolean): void {
    const loaded = loadPlan(config);
    const html = loaded.ok
      ? renderPlanPage({ ...loaded, decisionFor, justDecided: url.searchParams.get("saved") ?? undefined })
      : renderErrorPage(loaded.title, loaded.detail, loaded.help);
    send(res, loaded.ok ? 200 : loaded.status, head ? "" : html);
  }

  async function decide(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const badRequest = (detail: string) =>
      send(res, 400, renderErrorPage("That decision could not be saved", detail, "Go back to the plan and try again."));

    let form: URLSearchParams;
    try {
      form = new URLSearchParams(await readBody(req));
    } catch {
      badRequest("The form was too large.");
      return;
    }
    const invoiceId = form.get("invoice_id") ?? "";
    const step = form.get("step") ?? "";
    const decision = form.get("decision");
    if (decision !== "approved" && decision !== "rejected") {
      badRequest("Choose Approve or Reject.");
      return;
    }

    const loaded = loadPlan(config);
    if (!loaded.ok) {
      send(res, loaded.status, renderErrorPage(loaded.title, loaded.detail, loaded.help));
      return;
    }
    const action = loaded.plan.actions.find((a) => a.invoice_id === invoiceId && a.step === step);
    if (!action || !action.needs_approval) {
      badRequest(`Today's plan has no reminder for invoice ${invoiceId} that needs approval. The data may have changed.`);
      return;
    }
    decisions.set(keyFor(invoiceId, step), decision);
    // Post/Redirect/Get: a page reload does not send the form again.
    const location = `/?saved=${encodeURIComponent(invoiceId)}#${anchorFor(invoiceId)}`;
    res.writeHead(303, { Location: location, ...SECURITY_HEADERS });
    res.end();
  }

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = `${req.method} ${url.pathname}`;
    if (route === "GET /" || route === "HEAD /") {
      showPlan(res, url, req.method === "HEAD");
    } else if (route === "POST /decision") {
      decide(req, res).catch((err) => {
        console.error(err);
        if (!res.headersSent) send(res, 500, renderErrorPage("Something went wrong", "The decision was not saved.", "Try again."));
      });
    } else if (url.pathname === "/" || url.pathname === "/decision") {
      send(res, 405, renderErrorPage("Not allowed", `${req.method} is not used on this page.`, "Open the plan instead."));
    } else {
      send(res, 404, renderErrorPage("Page not found", "There is nothing at this address.", "Open the plan instead."));
    }
  });
}

function main(): void {
  const port = Number(process.env.PORT || "8000");
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`PORT "${process.env.PORT}" is not a valid port number.`);
    process.exit(2);
  }
  const dataDir = process.env.DATA_DIR || "../data";
  const fixedToday = process.env.TODAY;
  const server = createApp({ dataDir, today: () => fixedToday || localToday() });
  server.listen(port, () => {
    console.log(`Serving on http://localhost:${port}/ (data: ${dataDir}, today: ${fixedToday || "real date"})`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
