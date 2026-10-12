import assert from "node:assert/strict";
import { test } from "node:test";
import { isIsoDate, localToday, parseIsoDate } from "../src/dates";

test("accepts real YYYY-MM-DD dates", () => {
  for (const d of ["2026-10-12", "2024-02-29", "2000-02-29", "2026-12-31", "2026-01-01"]) {
    assert.equal(isIsoDate(d), true, d);
  }
});

test("rejects impossible dates and other formats", () => {
  const bad = [
    "2026-02-30", "2026-02-29", "1900-02-29", "2026-04-31", "2026-13-01", "2026-00-10",
    "2026-10-00", "30/09/2026", "2026-9-30", "2026-09-30T00:00:00Z", " 2026-09-30",
    "2026-09-30 ", "", "20260930", "２０２６-09-30",
  ];
  for (const d of bad) assert.equal(isIsoDate(d), false, JSON.stringify(d));
});

test("rejects values that are not strings", () => {
  for (const v of [null, undefined, 20260930, true, {}, []]) assert.equal(isIsoDate(v), false);
});

test("day numbers count calendar days across months, years and leap days", () => {
  const diff = (a: string, b: string) => (parseIsoDate(b) as number) - (parseIsoDate(a) as number);
  assert.equal(diff("2026-09-30", "2026-10-12"), 12);
  assert.equal(diff("2026-10-12", "2026-10-12"), 0);
  assert.equal(diff("2025-12-31", "2026-01-01"), 1);
  assert.equal(diff("2024-02-28", "2024-03-01"), 2);
  assert.equal(diff("2026-03-28", "2026-03-30"), 2); // across a DST change in Europe
  assert.equal(parseIsoDate("1970-01-01"), 0);
});

test("localToday formats the local date", () => {
  assert.equal(localToday(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});
