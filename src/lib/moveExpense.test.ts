import { describe, expect, it } from "vitest";
import { planMove } from "./moveExpense";

const src = {
  members: [
    { id: "s1", user_id: "u1", name: "Ana" },
    { id: "s2", user_id: "u2", name: "Bo" },
  ],
  categories: [{ id: "sc1", name: "Groceries" }],
};
const dst = {
  members: [
    { id: "d2", user_id: "u2", name: "Bo (renamed)" },
    { id: "d1", user_id: "u1", name: "Ana" },
  ],
  categories: [{ id: "dc1", name: " groceries " }],
  importKeys: new Set<string>(),
};
const expense = { category_id: "sc1", import_key: null as string | null };

describe("planMove", () => {
  it("maps members by account and the category by name", () => {
    expect(planMove(src, dst, expense)).toEqual({ ok: true, memberMap: { s1: "d1", s2: "d2" }, categoryId: "dc1" });
  });

  it("matches members without an account by exact name", () => {
    const s = { ...src, members: [{ id: "s1", user_id: null, name: "Guest" }] };
    const d = { ...dst, members: [{ id: "d1", user_id: null, name: "Guest" }] };
    expect(planMove(s, d, expense)).toMatchObject({ ok: true, memberMap: { s1: "d1" } });
    const other = { ...dst, members: [{ id: "d1", user_id: null, name: "guest" }] };
    expect(planMove(s, other, expense)).toEqual({ ok: false, reason: "members" });
  });

  it("refuses when the groups do not have exactly the same members", () => {
    const extra = { ...dst, members: [...dst.members, { id: "d3", user_id: "u3", name: "Cy" }] };
    expect(planMove(src, extra, expense)).toEqual({ ok: false, reason: "members" });
    const fewer = { ...dst, members: dst.members.slice(0, 1) };
    expect(planMove(src, fewer, expense)).toEqual({ ok: false, reason: "members" });
  });

  it("refuses when a member's account differs even if the name is equal", () => {
    const d = { ...dst, members: [{ id: "d1", user_id: "u9", name: "Ana" }, dst.members[0]] };
    expect(planMove(src, d, expense)).toEqual({ ok: false, reason: "members" });
  });

  it("refuses when the category has no match by name in the target", () => {
    expect(planMove(src, { ...dst, categories: [{ id: "dc1", name: "Fuel" }] }, expense)).toEqual({ ok: false, reason: "category" });
  });

  it("lets an expense without a category through", () => {
    expect(planMove(src, { ...dst, categories: [] }, { category_id: null, import_key: null })).toMatchObject({ ok: true, categoryId: null });
  });

  it("refuses an imported expense whose key already exists in the target", () => {
    const d = { ...dst, importKeys: new Set(["k"]) };
    expect(planMove(src, d, { category_id: null, import_key: "k" })).toEqual({ ok: false, reason: "import_key" });
    expect(planMove(src, d, { category_id: null, import_key: "other" })).toMatchObject({ ok: true });
  });
});
