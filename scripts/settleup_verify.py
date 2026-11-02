#!/usr/bin/env python3
"""Compare an imported group (read back from the database) with the Settle Up CSV it came from.

Usage:
  python3 -I scripts/settleup_verify.py --csv "Group.csv" --rows db_rows.json \
      --member "AAmorchis=Edwin Guilbert" --member "Adriana=Adriana Santeliz" \
      --expect-total 1370.71 --expect-balance "AAmorchis=-97.76" --expect-consumed "AAmorchis=644.77"

db_rows.json is the output of the read-back query in CLAUDE.md (the JSON with a top-level "rows" list).
Exit code is 1 if any check fails.
"""
import argparse, csv, io, json, sys
from datetime import datetime, timezone
from decimal import Decimal as D

ap = argparse.ArgumentParser()
ap.add_argument("--csv", required=True); ap.add_argument("--rows", required=True)
ap.add_argument("--member", action="append", required=True, help="'Settle Up name=name of the member in the app'")
ap.add_argument("--expect-total"); ap.add_argument("--expect-balance", action="append", default=[]); ap.add_argument("--expect-consumed", action="append", default=[])
a = ap.parse_args()

raw = open(a.csv, "rb").read()
try: text = raw.decode("utf-16")
except UnicodeError: text = raw.decode("utf-8-sig")
src = sorted(csv.DictReader(io.StringIO(text)), key=lambda r: r["Date & time"])
db = json.load(open(a.rows))["rows"]
name = dict(m.split("=", 1) for m in a.member)
cents = lambda s: int((D(s) * 100).to_integral_value())
utc = lambda r: datetime.fromisoformat(r["Date & time"].replace(" ", "T") + r["Timezone"]).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

ok = True
def check(c, msg):
    global ok; ok &= bool(c); print(("PASS " if c else "FAIL ") + msg)

check(len(db) == len(src), f"expense count: app {len(db)} vs CSV {len(src)}")
bad = []
for r, d in zip(src, db):
    who = [name[w.strip()] for w in r["For whom"].split(";")]; split = [cents(x) for x in r["Split amounts"].split(";")]
    got = {s["m"]: s["c"] for s in d["shares"]}; p = []
    if d["title"] != r["Purpose"].strip(): p.append("title")
    if d["amount_cents"] != cents(r["Amount"]): p.append("amount")
    if d["payer"] != name[r["Who paid"].strip()]: p.append("payer")
    if d["utc"] != utc(r): p.append(f"time {d['utc']} vs {utc(r)}")
    if set(got) != set(who): p.append("participants")
    if sum(got.values()) != d["amount_cents"]: p.append("shares do not add up to the amount")
    if any(abs(got.get(w, 0) - c) > 1 for w, c in zip(who, split)): p.append("a share differs from Settle Up by more than a cent")
    if p: bad.append((r["Purpose"].strip(), p))
check(not bad, "each expense matches the CSV (title, amount, payer, UTC time, participants, shares)" + (f": {bad}" if bad else ""))

paid, owed = {}, {}
for d in db:
    paid[d["payer"]] = paid.get(d["payer"], 0) + d["amount_cents"]
    for s in d["shares"]: owed[s["m"]] = owed.get(s["m"], 0) + s["c"]
total = sum(d["amount_cents"] for d in db)
print(f"      total {total/100:.2f}")
for m in sorted(set(paid) | set(owed)): print(f"      {m:20} paid {paid.get(m,0)/100:9.2f} | consumed {owed.get(m,0)/100:9.2f} | balance {(paid.get(m,0)-owed.get(m,0))/100:+9.2f}")
if a.expect_total: check(total == cents(a.expect_total), f"total spent = {a.expect_total}")
for e in a.expect_balance:
    k, v = e.split("=", 1); m = name[k]; check(paid.get(m, 0) - owed.get(m, 0) == cents(v), f"balance of {k} = {v}")
for e in a.expect_consumed:
    k, v = e.split("=", 1); m = name[k]; check(owed.get(m, 0) == cents(v), f"consumed by {k} = {v}  (Settle Up's 'Spent')")
print("\nALL CHECKS PASSED" if ok else "\nSOME CHECKS FAILED"); sys.exit(0 if ok else 1)
