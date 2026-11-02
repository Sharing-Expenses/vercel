#!/usr/bin/env python3
"""Turn a Settle Up CSV export into SQL that creates one group in the Sharing database.

Usage (run with -I, see CLAUDE.md):
  python3 -I settleup_import.py --csv "Group.csv" --group "October 2026" --color pink --lang es \
      --creator <auth user uuid> \
      --member "AAmorchis=<auth user uuid>:Edwin Guilbert" \
      --member "Adriana=<auth user uuid>:Adriana Santeliz" \
      --expect-total 1370.71 --expect-balance "AAmorchis=-97.76" --out import.sql

--member "<Settle Up name>=<user uuid>:<display name>"   (leave the uuid empty for a person without an account:
                                                           --member "Pepe=:Pepe", they can claim it when joining)
"""
import argparse, csv, io, json, sys, uuid
from decimal import Decimal as D

ap = argparse.ArgumentParser()
ap.add_argument("--csv", required=True)
ap.add_argument("--group", required=True)
ap.add_argument("--color", required=True, choices=["orange", "green", "blue", "purple", "pink", "teal", "red", "yellow"])
ap.add_argument("--lang", default="en", choices=["en", "es"], help="language of the seeded categories")
ap.add_argument("--creator", required=True, help="auth.users id of the member who will own the group")
ap.add_argument("--member", action="append", required=True)
ap.add_argument("--expect-total", help="'total spent' shown by Settle Up, e.g. 1370.71")
ap.add_argument("--expect-balance", action="append", default=[], help="NAME=amount as shown by Settle Up (negative = owes)")
ap.add_argument("--out", default="import.sql")
a = ap.parse_args()

# Settle Up exports UTF-16 with a BOM; fall back to UTF-8 in case that changes.
raw = open(a.csv, "rb").read()
try: text = raw.decode("utf-16")
except UnicodeError: text = raw.decode("utf-8-sig")
rows = list(csv.DictReader(io.StringIO(text)))
rows.sort(key=lambda r: r["Date & time"])

members = {}  # settle up name -> (user id or None, display name, member uuid)
for m in a.member:
    su, rest = m.split("=", 1); uid, disp = rest.split(":", 1)
    members[su.strip()] = (uid.strip() or None, disp.strip(), str(uuid.uuid4()))
if a.creator not in [v[0] for v in members.values()]:
    sys.exit("--creator must be one of the --member user ids")

def fail(msg): sys.exit("ABORT: " + msg)
if {r["Currency"] for r in rows} != {rows[0]["Currency"]}: fail("mixed currencies; convert them first")
currency = rows[0]["Currency"]

def distribute(total, weights, extra):
    """Largest-remainder split of `total` cents by `weights`. Ties go to whoever has received the
    fewest leftover cents so far (`extra`), so over many expenses nobody is systematically favoured."""
    s = sum(weights.values()); out = {k: total * w // s for k, w in weights.items()}
    left = total - sum(out.values())
    order = sorted(weights, key=lambda k: (-((total * weights[k]) % s), extra[k], list(weights).index(k)))
    for k in order[:left]: out[k] += 1; extra[k] += 1
    return out

q = lambda s: "'" + s.replace("'", "''") + "'"
gid = str(uuid.uuid4()); extra = {k: 0 for k in members}
paid = {k: 0 for k in members}; owed = {k: 0 for k in members}
expenses, shares, total, notes = [], [], 0, []
for r in rows:
    if r["Type"].strip() != "expense": fail(f"row '{r['Purpose'].strip()}' has Type '{r['Type']}'; handle transfers manually (is_transfer = true)")
    payer = r["Who paid"].strip(); who = [w.strip() for w in r["For whom"].split(";")]
    for n in who + [payer]:
        if n not in members: fail(f"'{n}' has no --member mapping")
    cents = int((D(r["Amount"]) * 100).to_integral_value())
    splits = [int((D(x) * 100).to_integral_value()) for x in r["Split amounts"].split(";")]
    if len(splits) != len(who): fail(f"split/participant mismatch in '{r['Purpose'].strip()}'")
    if len(set(splits)) == 1:   # equal split: store as shares (1 each), like the app's default
        mode = "shares"; part = distribute(cents, {w: 1 for w in who}, extra); inputs = {w: 1 for w in who}
    else:                       # unequal: keep Settle Up's amounts (re-balanced to the exact total if rounded)
        mode = "amounts"; inputs = {w: None for w in who}
        part = dict(zip(who, splits)) if sum(splits) == cents else distribute(cents, dict(zip(who, splits)), extra)
        if sum(splits) != cents: notes.append(f"re-balanced unequal split of '{r['Purpose'].strip()}' ({sum(splits)/100} -> {cents/100})")
    assert sum(part.values()) == cents
    eid = str(uuid.uuid4()); paid[payer] += cents; total += cents
    for w in who: owed[w] += part[w]
    ts = r["Date & time"].replace(" ", "T") + r["Timezone"]
    expenses.append(f"({q(eid)},{q(gid)},{q(r['Purpose'].strip())},{cents},{q(members[payer][2])},{q(ts)}::timestamptz,{q(mode)},false,{q(a.creator)})")
    for w in who: shares.append(f"({q(eid)},{q(members[w][2])},{part[w]},{'null' if inputs[w] is None else inputs[w]})")

# ---- pre-flight against what Settle Up itself displays
print(f"{len(expenses)} expenses | total {total/100:.2f} {currency}")
for k in members: print(f"  {k:14} paid {paid[k]/100:9.2f}  consumed {owed[k]/100:9.2f}  balance {(paid[k]-owed[k])/100:+9.2f}")
for n in notes: print("  note:", n)
bad = []
if a.expect_total and int(D(a.expect_total) * 100) != total: bad.append(f"total {total/100} != expected {a.expect_total}")
for e in a.expect_balance:
    k, v = e.split("=", 1)
    if int(D(v) * 100) != paid[k] - owed[k]: bad.append(f"balance of {k} is {(paid[k]-owed[k])/100}, expected {v}")
if bad: fail("; ".join(bad) + "  (differences of a cent or two usually come from half-cent rounding; do not import until understood)")
print("pre-flight OK")

cats = {"es": [("Comida","🍜"),("Bebida","🍺"),("Alojamiento","🛏️"),("Transporte","🚌"),("Billetes","🎫"),("La compra","🛒"),("Alquiler y gastos","🏠")],
        "en": [("Food","🍜"),("Drinks","🍺"),("Lodging","🛏️"),("Transport","🚌"),("Tickets","🎫"),("Groceries","🛒"),("Rent & bills","🏠")]}[a.lang]
mrows = ",\n".join(f"  ({q(m[2])}, {q(gid)}, {q(m[0]) if m[0] else 'null'}, {q(m[1])}, " +
                   (f"(select avatar_url from public.profiles where id={q(m[0])})" if m[0] else "null") + ")" for m in members.values())
nl = ",\n"
sql = f"""begin;
insert into public.groups (id, name, currency, color, created_by) values ({q(gid)}, {q(a.group)}, {q(currency)}, {q(a.color)}, {q(a.creator)});
insert into public.members (id, group_id, user_id, name, avatar_url) values
{mrows};
insert into public.categories (group_id, name, emoji, sort) values
{nl.join(f"  ({q(gid)}, {q(n)}, {q(e)}, {i+1})" for i, (n, e) in enumerate(cats))};
insert into public.expenses (id, group_id, title, amount_cents, paid_by, spent_at, split_mode, is_transfer, created_by) values
{nl.join(expenses)};
insert into public.expense_shares (expense_id, member_id, cents, input_value) values
{nl.join(shares)};
commit;
"""
open(a.out, "w").write(sql)
print("wrote", a.out)
