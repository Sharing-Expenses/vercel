import { describe, expect, it } from "vitest";
import { suggestCategory } from "./autoCategory";

const es = ["La compra", "Comida", "Bebida", "Casa", "Gasolina", "Niños", "Seguros", "Streaming", "Alojamiento", "Billetes", "Transporte"]
  .map((name, i) => ({ id: `c${i + 1}`, name, sort: i + 1 }));
const en = ["Groceries", "Food", "Drinks"].map((name, i) => ({ id: `e${i + 1}`, name, sort: i + 1 }));

describe("suggestCategory", () => {
  it("uses the keyword list", () => {
    expect(suggestCategory("Aldi", es, [])).toBe("c1");
    expect(suggestCategory("Gasolina Matcha", es, [])).toBe("c5");
    expect(suggestCategory("seguro coche", es, [])).toBe("c7");
    expect(suggestCategory("Día", es, [])).toBe("c1");
    expect(suggestCategory("Netflix", es, [])).toBe("c8");
    expect(suggestCategory("Mercado", es, [])).toBe("c1");
  });
  it("works in English groups and prefers the longest keyword", () => {
    expect(suggestCategory("Aldi", en, [])).toBe("e1");
    expect(suggestCategory("Uber Eats", [...en, { id: "t", name: "Transport", sort: 11 }], [])).toBe("e2");
  });
  it("learns from past expenses over the built-in list", () => {
    expect(suggestCategory("Cachitos", es, [{ title: "cachitos ", category_id: "c2" }])).toBe("c2");
    expect(suggestCategory("Carne Las Maravillas", es, [{ title: "carne las maravillas", category_id: "c2" }])).toBe("c2");
    expect(suggestCategory("Aldi", es, [{ title: "Aldi", category_id: "c2" }])).toBe("c2");
  });
  it("ignores ambiguous learned words and unknown categories", () => {
    const past = [{ title: "cena oxana", category_id: "c2" }, { title: "limpieza oxana", category_id: "c4" }, { title: "oxana", category_id: "gone" }];
    expect(suggestCategory("oxana viernes", es, past)).toBe("c4");
    expect(suggestCategory("zzz", es, past)).toBeNull();
    expect(suggestCategory("", es, past)).toBeNull();
  });
});
