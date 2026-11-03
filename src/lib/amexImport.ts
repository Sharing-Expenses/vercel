/** Import of an American Express activity export (`Fecha,Descripción,Importe`) as shared expenses. */

export type AmexRow = {
  /** yyyy-mm-dd */
  date: string;
  title: string;
  cents: number;
  /** Identifies this charge across imports: date, title, cents and its number among identical charges in the file. */
  key: string;
};

export type ParsedCsv = {
  rows: AmexRow[];
  /** Zero or negative amounts (refunds, card payments): the app has no use for them. */
  skipped: number;
  /** 1-based line numbers (header is line 1) of rows whose date or amount could not be read. */
  invalid: number[];
};

export class ImportFormatError extends Error {}

const HEADER = ["Fecha", "Descripción", "Importe"];

/** UTF-16 when a UTF-16 BOM is present, else UTF-8; the BOM is dropped. */
export function decodeCsv(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  return new TextDecoder("utf-8").decode(b).replace(/^﻿/, "");
}

/** Split CSV text into records (quotes, `""` escapes, CRLF), remembering each record's starting line. */
function records(text: string): { fields: string[]; line: number }[] {
  const out: { fields: string[]; line: number }[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let startLine = 1;
  const endRecord = () => {
    fields.push(field);
    if (fields.length > 1 || fields[0].trim() !== "") out.push({ fields, line: startLine });
    fields = [];
    field = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else { if (c === "\n") line++; field += c; }
    } else if (c === '"') quoted = true;
    else if (c === ",") { fields.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      startLine = line;
    } else field += c;
  }
  endRecord();
  return out;
}

function parseDate(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "51,69" -> 5169, "-1.227,79" -> -122779; null when unreadable. Integer arithmetic only. */
function parseCents(s: string): number | null {
  const m = /^(-)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(s.trim());
  if (!m) return null;
  const whole = Number(m[2].replace(/\./g, ""));
  const frac = Number((m[3] ?? "").padEnd(2, "0"));
  const cents = whole * 100 + frac;
  return m[1] ? -cents : cents;
}

export function parseAmexCsv(text: string): ParsedCsv {
  const recs = records(text);
  if (recs.length === 0) throw new ImportFormatError("The file is empty");
  const head = recs[0].fields.map((f) => f.trim().normalize("NFC"));
  if (HEADER.some((h, i) => head[i] !== h)) {
    throw new ImportFormatError(`Expected the header ${HEADER.join(",")}`);
  }

  const result: ParsedCsv = { rows: [], skipped: 0, invalid: [] };
  const seen = new Map<string, number>();
  for (const { fields, line } of recs.slice(1)) {
    const date = parseDate(fields[0] ?? "");
    const cents = parseCents(fields[2] ?? "");
    if (!date || cents === null) {
      result.invalid.push(line);
      continue;
    }
    if (cents <= 0) {
      result.skipped++;
      continue;
    }
    const title = (fields[1] ?? "").replace(/\s+/g, " ").trim();
    const base = `${date}|${title}|${cents}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    result.rows.push({ date, title, cents, key: `${base}|${n}` });
  }
  return result;
}

export function partitionRows(rows: AmexRow[], knownKeys: Set<string>): { fresh: AmexRow[]; duplicates: AmexRow[] } {
  const fresh: AmexRow[] = [];
  const duplicates: AmexRow[] = [];
  for (const r of rows) (knownKeys.has(r.key) ? duplicates : fresh).push(r);
  return { fresh, duplicates };
}
