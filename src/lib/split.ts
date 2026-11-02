// All money is integer cents to avoid floating point drift.

export type SplitMode = "amounts" | "percent" | "shares";

export type SplitInput = {
  memberId: string;
  // amounts: cents; percent: 0-100 (may be fractional); shares: positive number
  value: number;
};

export type Share = { memberId: string; cents: number };

/**
 * Distribute `total` cents proportionally to `weights` using the
 * largest-remainder method, so shares always sum exactly to `total`.
 */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}

/** Equal split among the given members. */
export function splitEqually(total: number, memberIds: string[]): Share[] {
  const parts = distribute(total, memberIds.map(() => 1));
  return memberIds.map((memberId, i) => ({ memberId, cents: parts[i] }));
}

export type SplitResult =
  | { ok: true; shares: Share[] }
  | { ok: false; error: string };

export function computeSplit(
  total: number,
  mode: SplitMode,
  inputs: SplitInput[],
): SplitResult {
  if (inputs.length === 0) return { ok: false, error: "Select at least one member" };
  if (inputs.some((i) => i.value < 0)) return { ok: false, error: "Values cannot be negative" };

  if (mode === "amounts") {
    const sum = inputs.reduce((a, i) => a + i.value, 0);
    if (sum !== total) return { ok: false, error: "Amounts must add up to the total" };
    return { ok: true, shares: inputs.map((i) => ({ memberId: i.memberId, cents: i.value })) };
  }

  if (mode === "percent") {
    const sum = inputs.reduce((a, i) => a + i.value, 0);
    if (Math.abs(sum - 100) > 0.001) return { ok: false, error: "Percentages must add up to 100%" };
  } else if (inputs.every((i) => i.value === 0)) {
    return { ok: false, error: "At least one share must be above zero" };
  }

  const parts = distribute(total, inputs.map((i) => i.value));
  return { ok: true, shares: inputs.map((i, k) => ({ memberId: i.memberId, cents: parts[k] })) };
}
