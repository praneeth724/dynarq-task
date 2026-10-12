# Payment reminder assistant (TypeScript)

**Run** (Node.js 20+, from `typescript/`, after `npm install`):
- Tests: `npm test` (54 tests: rules, dates, messages, the command and the page). Types: `npm run typecheck`.
- Command: `npm run plan -- --invoices ../data/invoices.json --sent ../data/sent.json --today 2026-10-12 --out ../actions.json`
- Page: `npm run app`, then open http://localhost:8000/ (`PORT`, `DATA_DIR`, `TODAY` are read as in the task).

**Structure** (`typescript/src/`): `rules.ts` is the engine (`buildPlan`, pure, no I/O); `dates.ts` strict
`YYYY-MM-DD` parsing; `messages.ts` templates and `checkMessage`; `data.ts` reads the JSON files; `plan.ts`
the command; `page.ts` renders HTML; `app.ts` the `node:http` server. The command and the page both call `buildPlan`.

**Decisions**
- Dates are whole day numbers, never `Date` objects with a time, so time zones and DST cannot shift a day.
- Bad-data checks run in the README order, and only the first reason is reported. Duplicate ids are checked first and listed once.
- Entries that are not objects or have no text `id` cannot be reported by id, so they are left out.
- Sorting uses plain `<` comparison (`INV-100` before `INV-99`), not `localeCompare`.
- Command exit codes: 0 plan written, 1 file cannot be read/written, 2 bad arguments or `--today`.
- Messages come from fixed templates (no AI), so they work offline and are always the same. Tests run every template
  through `checkMessage`: all required facts present, no other figure, and no fee, interest, deadline or earlier-reminder wording.
- The page builds the plan fresh on each request. Decisions are kept in memory, keyed by invoice and step, so approving
  a firm reminder does not approve a later final notice. It uses plain HTML forms (keyboard, no JavaScript) and
  Post/Redirect/Get, and shows clear empty, error and invalid-`TODAY` states. All file data is HTML-escaped.
- Research answers (`RESEARCH.md`) use only `sources/`; the 25 EUR fee and the ECB rate are kept out of the messages.

**Next, with more time**: store decisions in a file or database and log who decided what and when. Add an optional
AI writer behind an API key, with its text checked by `checkMessage` and the template as fallback. Show the
message only on request on small screens, add filtering by customer, and run an automated accessibility check.
