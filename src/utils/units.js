import { normalizeText } from "./catalogUtils.js";

export const UNITS = [
    { id: "litro", label: "L", dimension: "volume", factor: 1, aliases: ["l", "lt", "lts", "litros"] },
    { id: "mililitro", label: "mL", dimension: "volume", factor: 0.001, aliases: ["ml", "mililitros"] },
    { id: "kg", label: "kg", dimension: "mass", factor: 1, aliases: ["kilogramo", "kilogramos", "kilo", "kilos"] },
    { id: "gramo", label: "g", dimension: "mass", factor: 0.001, aliases: ["g", "gr", "gramos"] },
    ...["pieza", "garrafa", "envase", "botella", "bolsa", "porron"].map((id) => ({ id, label: id === "porron" ? "porrón" : id, dimension: id, factor: 1, aliases: [id + "s", ...(id === "pieza" ? ["pza", "pzas", "unidad", "unidades"] : [])] })),
];
export function normalizeUnit(value) {
    const text = normalizeText(String(value ?? ""));
    return UNITS.find((unit) => unit.id === text || unit.aliases.includes(text))?.id || null;
}
export function unitLabel(value) { return UNITS.find((u) => u.id === normalizeUnit(value))?.label || value || "—"; }
export function convertQuantity(quantity, from, to) {
    const source = UNITS.find((u) => u.id === normalizeUnit(from));
    const target = UNITS.find((u) => u.id === normalizeUnit(to));
    if (!source || !target || source.dimension !== target.dimension || quantity === "" || quantity == null || !Number.isFinite(Number(quantity))) return null;
    const result = Number(quantity) * source.factor / target.factor;
    return Number.isFinite(result) ? result : null;
}
