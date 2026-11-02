import { describe, expect, it } from "vitest";
import { computeSplit, distribute, splitEqually } from "./split";
import { categoryTotals, memberTotals, simplifyDebts } from "./balances";
import { formatMoney, parseMoney } from "./money";

describe("split", () => {
  it("distributes odd cents without losing any", () => {
    expect(distribute(4309, [1, 1])).toEqual([2155, 2154]);
    expect(distribute(100, [1, 1, 1]).reduce((a, b) => a + b)).toBe(100);
  });

  it("splits equally", () => {
    const s = splitEqually(4200, ["a", "b"]);
    expect(s.map((x) => x.cents)).toEqual([2100, 2100]);
  });

  it("validates amounts must add up", () => {
    const r = computeSplit(1000, "amounts", [
      { memberId: "a", value: 400 },
      { memberId: "b", value: 500 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("splits by percent", () => {
    const r = computeSplit(1000, "percent", [
      { memberId: "a", value: 70 },
      { memberId: "b", value: 30 },
    ]);
    expect(r).toEqual({
      ok: true,
      shares: [
        { memberId: "a", cents: 700 },
        { memberId: "b", cents: 300 },
      ],
    });
  });

  it("rejects percent not summing to 100", () => {
    const r = computeSplit(1000, "percent", [{ memberId: "a", value: 60 }, { memberId: "b", value: 30 }]);
    expect(r.ok).toBe(false);
  });

  it("splits by shares", () => {
    const r = computeSplit(900, "shares", [
      { memberId: "a", value: 2 },
      { memberId: "b", value: 1 },
    ]);
    expect(r.ok && r.shares.map((s) => s.cents)).toEqual([600, 300]);
  });
});

describe("balances", () => {
  const expenses = [
    { paidBy: "adriana", amount: 4200, shares: splitEqually(4200, ["ed", "adriana"]), category: "food" },
    { paidBy: "ed", amount: 4309, shares: splitEqually(4309, ["ed", "adriana"]), category: "groceries" },
  ];

  it("computes totals that sum to zero", () => {
    const t = memberTotals(["ed", "adriana"], expenses);
    expect(t.reduce((a, x) => a + x.balance, 0)).toBe(0);
    expect(t.find((x) => x.memberId === "adriana")!.paid).toBe(4200);
  });

  it("simplifies debts", () => {
    const debts = simplifyDebts(memberTotals(["ed", "adriana"], expenses));
    expect(debts).toHaveLength(1);
    expect(debts[0].from).toBe("adriana");
    expect(debts[0]).toEqual({ from: "adriana", to: "ed", cents: 54 });
  });

  it("settles a 3-person group with minimal transfers", () => {
    const e = [{ paidBy: "a", amount: 3000, shares: splitEqually(3000, ["a", "b", "c"]) }];
    const debts = simplifyDebts(memberTotals(["a", "b", "c"], e));
    expect(debts).toEqual([
      { from: "b", to: "a", cents: 1000 },
      { from: "c", to: "a", cents: 1000 },
    ]);
  });

  it("totals by category", () => {
    const c = categoryTotals(expenses);
    expect(c[0]).toEqual({ category: "groceries", cents: 4309 });
  });
});

describe("money", () => {
  it("parses comma and dot decimals", () => {
    expect(parseMoney("43,09")).toBe(4309);
    expect(parseMoney("43.1")).toBe(4310);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
  });
  it("formats", () => {
    expect(formatMoney(4309, "EUR", "en-US")).toBe("€43.09");
  });
});
