/** Guess an expense's category from its description, as soon as it is typed. */

type Key = "groceries" | "food" | "drinks" | "house" | "fuel" | "kid" | "insurance" | "streaming" | "lodging" | "tickets" | "transport";

/** Default categories in display order (migration 0004) with the names they get in each language. */
const DEFAULTS: { key: Key; names: string[] }[] = [
  { key: "groceries", names: ["groceries", "la compra"] },
  { key: "food", names: ["food", "comida"] },
  { key: "drinks", names: ["drinks", "bebida"] },
  { key: "house", names: ["house", "casa"] },
  { key: "fuel", names: ["fuel", "gasolina"] },
  { key: "kid", names: ["kid", "ninos"] },
  { key: "insurance", names: ["insurance", "seguros"] },
  { key: "streaming", names: ["streaming"] },
  { key: "lodging", names: ["lodging", "alojamiento"] },
  { key: "tickets", names: ["tickets", "billetes"] },
  { key: "transport", names: ["transport", "transporte"] },
];

/** Words (or phrases) that point at a category. Lower case, no accents. The longest match wins. */
const KEYWORDS: Record<Key, string[]> = {
  groceries: ["aldi", "dia", "mercadona", "lidl", "carrefour", "alcampo", "eroski", "consum", "hipercor", "supercor", "costco", "tesco", "walmart",
    "supermercado", "supermarket", "super", "mercado", "carniceria", "carne", "pescaderia", "fruteria", "panaderia", "verdura", "grocery", "groceries", "butcher", "bakery", "hiber"],
  food: ["restaurante", "restaurant", "comida", "cena", "almuerzo", "desayuno", "pizza", "pizzeria", "burger", "kebab", "sushi", "cafe", "cafeteria",
    "mcdonalds", "telepizza", "glovo", "just eat", "uber eats", "deliveroo", "takeaway", "lunch", "dinner", "breakfast", "brunch", "tapas", "menu"],
  drinks: ["bar", "copas", "cerveza", "cervezas", "vino", "cana", "canas", "cocktail", "cocteles", "beer", "wine", "pub", "drinks", "birra"],
  house: ["alquiler", "rent", "luz", "agua", "gas", "internet", "wifi", "ikea", "leroy", "ferreteria", "limpieza", "electricidad", "comunidad",
    "hipoteca", "mortgage", "bricolaje", "muebles", "furniture", "hogar", "oxana"],
  fuel: ["gasolina", "gasolinera", "diesel", "repsol", "cepsa", "galp", "shell", "fuel", "petrol", "combustible", "gas station"],
  kid: ["colegio", "cole", "guarderia", "panales", "juguete", "juguetes", "uniforme", "school", "toy", "toys", "diaper", "diapers", "nursery", "escuela", "pediatra", "kid", "kids"],
  insurance: ["seguro", "seguros", "mutua", "insurance", "poliza", "axa", "mapfre", "sanitas", "adeslas"],
  streaming: ["netflix", "spotify", "hbo", "disney", "prime", "youtube", "apple tv", "dazn", "filmin", "twitch", "streaming", "suscripcion", "subscription"],
  lodging: ["hotel", "hostal", "hostel", "airbnb", "booking", "alojamiento", "apartamento", "lodging", "camping"],
  tickets: ["entrada", "entradas", "billete", "billetes", "ticket", "tickets", "cine", "concierto", "teatro", "museo", "vuelo", "flight", "ryanair", "vueling", "iberia"],
  transport: ["taxi", "uber", "cabify", "bolt", "bus", "autobus", "metro", "tren", "train", "renfe", "parking", "aparcamiento", "peaje", "toll", "transporte", "tranvia"],
};

const STOPWORDS = new Set(["the", "and", "for", "con", "los", "las", "del", "una", "uno", "por", "para", "que", "y", "de", "la", "el", "en", "un"]);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (s: string) => norm(s).split(" ").filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));

type Cat = { id: string; name: string; sort: number };
type Past = { title: string; category_id: string | null };

/** Which of the group's categories is this keyword group (matched by name, falling back to its default position). */
function categoryFor(key: Key, categories: Cat[]): string | null {
  const d = DEFAULTS.find((x) => x.key === key)!;
  const byName = categories.find((c) => d.names.includes(norm(c.name)));
  if (byName) return byName.id;
  const pos = DEFAULTS.indexOf(d) + 1;
  return categories.find((c) => c.sort === pos && !DEFAULTS.some((o) => o.names.includes(norm(c.name))))?.id ?? null;
}

/**
 * 1. A description used before in this group wins (exact, then by shared words), so it learns your own shops and corrections.
 * 2. Otherwise the built-in keyword list, in Spanish and English.
 * Returns a category id of this group, or null when there is no good guess.
 */
export function suggestCategory(title: string, categories: Cat[], past: Past[]): string | null {
  const t = norm(title);
  if (!t) return null;
  const known = new Set(categories.map((c) => c.id));
  const used = past.filter((p): p is { title: string; category_id: string } => !!p.category_id && known.has(p.category_id));

  // exact description seen before: most frequent category
  const same = new Map<string, number>();
  for (const p of used) if (norm(p.title) === t) same.set(p.category_id, (same.get(p.category_id) ?? 0) + 1);
  const exact = top(same);
  if (exact) return exact;

  // shared words: a word only counts if past expenses with it agree (>= 60%)
  const words = new Set(tokens(title));
  if (words.size) {
    const perWord = new Map<string, Map<string, number>>();
    for (const p of used) for (const w of new Set(tokens(p.title))) {
      if (!words.has(w)) continue;
      const m = perWord.get(w) ?? new Map<string, number>();
      m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1);
      perWord.set(w, m);
    }
    const votes = new Map<string, number>();
    for (const m of perWord.values()) {
      const sum = [...m.values()].reduce((a, b) => a + b, 0);
      const [cat, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
      if (n / sum >= 0.6) votes.set(cat, (votes.get(cat) ?? 0) + n);
    }
    const learned = top(votes);
    if (learned) return learned;
  }

  // built-in keywords: the longest one found in the description wins ("uber eats" beats "uber")
  const padded = ` ${t} `;
  let best: { key: Key; len: number } | null = null;
  for (const key of Object.keys(KEYWORDS) as Key[]) {
    for (const kw of KEYWORDS[key]) {
      const hit = padded.includes(` ${kw} `) || (kw.length >= 5 && !kw.includes(" ") && [...words].some((w) => w.startsWith(kw)));
      if (hit && (!best || kw.length > best.len)) best = { key, len: kw.length };
    }
  }
  return best ? categoryFor(best.key, categories) : null;
}

function top(m: Map<string, number>): string | null {
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of m) if (v > n) { best = k; n = v; }
  return best;
}
