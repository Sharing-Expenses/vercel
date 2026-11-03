import { describe, expect, it } from "vitest";
import { needsTombstone } from "./outbox";

describe("needsTombstone", () => {
  it("is true for an imported expense whose insert has not reached the server yet", () => {
    expect(needsTombstone({ import_key: "k" }, true)).toBe(true);
  });
  it("is false once the insert is synced, for manual expenses, and for empty keys", () => {
    expect(needsTombstone({ import_key: "k" }, false)).toBe(false);
    expect(needsTombstone({ import_key: null }, true)).toBe(false);
    expect(needsTombstone({}, true)).toBe(false);
  });
});
