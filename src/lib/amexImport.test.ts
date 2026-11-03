import { describe, expect, it } from "vitest";
import { decodeCsv, ImportFormatError, parseAmexCsv, partitionRows } from "./amexImport";

const HEADER = "Fecha,Descripción,Importe";
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

describe("parseAmexCsv", () => {
  it("parses a normal row", () => {
    const { rows } = parseAmexCsv(csv('26/10/2026,SHOP A    CITY,"51,69"'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: "2026-10-26", title: "SHOP A CITY", cents: 5169 });
  });

  it("keeps a quoted description with a comma as one field", () => {
    const { rows } = parseAmexCsv(csv('20/10/2026,"CLUB X, EL (C","70,00"'));
    expect(rows[0]).toMatchObject({ title: "CLUB X, EL (C", cents: 7000 });
  });

  it("skips negative and zero amounts and counts them", () => {
    const r = parseAmexCsv(csv('01/10/2026,PAYMENT,"-1227,79"', '02/10/2026,ZERO,"0,00"'));
    expect(r.rows).toEqual([]);
    expect(r.skipped).toBe(2);
  });

  it("parses a thousands separator", () => {
    expect(parseAmexCsv(csv('01/10/2026,BIG,"1.227,79"')).rows[0].cents).toBe(122779);
  });

  it("gives identical same-day charges distinct keys, stable across parses", () => {
    const text = csv('05/10/2026,SHOP,"10,00"', '05/10/2026,SHOP,"10,00"');
    const a = parseAmexCsv(text).rows.map((r) => r.key);
    expect(a[0].endsWith("|1")).toBe(true);
    expect(a[1].endsWith("|2")).toBe(true);
    expect(parseAmexCsv(text).rows.map((r) => r.key)).toEqual(a);
  });

  it("reports unparsable rows by line number and excludes them", () => {
    const r = parseAmexCsv(csv('31/02/2026,BAD DATE,"1,00"', '01/10/2026,BAD AMOUNT,abc', '01/10/2026,OK,"2,00"'));
    expect(r.invalid).toEqual([2, 3]);
    expect(r.rows.map((x) => x.title)).toEqual(["OK"]);
  });

  it("rejects an empty file and a wrong header, accepts a header-only file", () => {
    expect(() => parseAmexCsv("")).toThrow(ImportFormatError);
    expect(() => parseAmexCsv("Date,Name,Amount\n1,2,3")).toThrow(ImportFormatError);
    expect(parseAmexCsv(HEADER).rows).toEqual([]);
  });

  it("handles CRLF line endings", () => {
    expect(parseAmexCsv(`${HEADER}\r\n01/10/2026,A,"1,00"\r\n`).rows).toHaveLength(1);
  });
});

describe("decodeCsv", () => {
  const text = csv('01/10/2026,CAFÉ,"1,00"');
  const buf = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

  it("strips a UTF-8 BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
    expect(decodeCsv(buf(bytes))).toBe(text);
  });

  it("decodes UTF-16 LE with BOM", () => {
    const u16 = new Uint16Array([0xfeff, ...[...text].map((c) => c.charCodeAt(0))]);
    expect(decodeCsv(buf(new Uint8Array(u16.buffer)))).toBe(text);
  });

  it("decodes plain UTF-8", () => {
    expect(decodeCsv(buf(new TextEncoder().encode(text)))).toBe(text);
  });
});

describe("partitionRows", () => {
  it("splits by known keys", () => {
    const { rows } = parseAmexCsv(csv('01/10/2026,A,"1,00"', '02/10/2026,B,"2,00"'));
    const { fresh, duplicates } = partitionRows(rows, new Set([rows[0].key]));
    expect(duplicates.map((r) => r.title)).toEqual(["A"]);
    expect(fresh.map((r) => r.title)).toEqual(["B"]);
  });
});
