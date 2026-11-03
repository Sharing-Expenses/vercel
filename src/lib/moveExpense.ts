/** Rules for moving an expense to another group: only between groups with the very same members. */

type PlanMember = { id: string; user_id: string | null; name: string };
type PlanCategory = { id: string; name: string };

export type MovePlan =
  | { ok: true; memberMap: Record<string, string>; categoryId: string | null }
  | { ok: false; reason: "members" | "category" | "import_key" };

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Members pair up one-to-one: by account when they have one, by exact name otherwise. The category is found by
 * name in the target. An imported expense is refused when its import key already exists there.
 */
export function planMove(
  source: { members: PlanMember[]; categories: PlanCategory[] },
  target: { members: PlanMember[]; categories: PlanCategory[]; importKeys: Set<string> },
  expense: { category_id: string | null; import_key?: string | null },
): MovePlan {
  if (source.members.length !== target.members.length) return { ok: false, reason: "members" };

  const memberMap: Record<string, string> = {};
  const taken = new Set<string>();
  for (const m of source.members) {
    const match = target.members.find(
      (t) => !taken.has(t.id) && (m.user_id ? t.user_id === m.user_id : !t.user_id && t.name === m.name),
    );
    if (!match) return { ok: false, reason: "members" };
    taken.add(match.id);
    memberMap[m.id] = match.id;
  }

  let categoryId: string | null = null;
  if (expense.category_id) {
    const name = source.categories.find((c) => c.id === expense.category_id)?.name;
    const match = name === undefined ? undefined : target.categories.find((c) => sameName(c.name, name));
    if (!match) return { ok: false, reason: "category" };
    categoryId = match.id;
  }

  if (expense.import_key && target.importKeys.has(expense.import_key)) return { ok: false, reason: "import_key" };
  return { ok: true, memberMap, categoryId };
}
