// Reading invoices.json and sent.json. Used by both the command and the page, with
// one clear error message for each way a file can be wrong.

import { readFileSync } from "node:fs";

export class DataError extends Error {}

/** Read a file that must hold a JSON list. Throws DataError with a clear message. */
export function readJsonList(path: string, label: string): unknown[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const why = code === "ENOENT" ? "the file does not exist" : code === "EISDIR" ? "it is a folder" : (err as Error).message;
    throw new DataError(`Cannot read the ${label} file ${path}: ${why}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (err) {
    throw new DataError(`The ${label} file ${path} is not valid JSON: ${(err as Error).message}.`);
  }
  if (!Array.isArray(parsed)) {
    throw new DataError(`The ${label} file ${path} must contain a JSON list ([...]).`);
  }
  return parsed;
}

export interface Data {
  invoices: unknown[];
  sent: unknown[];
}

export function loadData(invoicesPath: string, sentPath: string): Data {
  return {
    invoices: readJsonList(invoicesPath, "invoices"),
    sent: readJsonList(sentPath, "sent reminders"),
  };
}
