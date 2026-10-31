import { catalogChoices, searchChoices, normalizeText } from "./catalog.mjs";
const same = (a, b) => String(a) === String(b);
const ids = (c) => c.tariffs.flatMap((t) => t.productIds);
const equalIds = (a, b) =>
  a.length === b.length && a.every((id) => b.some((other) => same(id, other)));

// Agrupar depende de relaciones oficiales, nunca de nombres parciales ni de precios iguales.
export function commercialChoices(data) {
  if (!data) return [];
  const all = catalogChoices(data),
    products = all.filter((c) => c.kind === "product");
  const covered = new Set(),
    primary = [];
  const append = (choice) => {
    const members = ids(choice)
      .map((id) => data.products.find((p) => same(p.id, id)))
      .filter(Boolean);
    const aliases = members
      .flatMap((p) => {
        const product = products.find((c) => same(c.refId, p.id));
        return [p.name, product?.name, product?.context];
      })
      .filter(Boolean);
    primary.push({
      ...choice,
      aliases: [...new Set(aliases)],
      commercial: true,
    });
    for (const id of ids(choice)) covered.add(String(id));
  };
  for (const group of all.filter(
    (c) => c.kind === "priceGroup" && c.tariffs.length === 1,
  )) {
    const members = ids(group).map((id) =>
      data.products.find((p) => same(p.id, id)),
    );
    if (new Set(members.map((p) => String(p.categoryId))).size !== 1) continue;
    const lineIds = [
      ...new Set(
        members.map((p) => (p.lineId == null ? null : String(p.lineId))),
      ),
    ];
    const line =
      lineIds.length === 1 && lineIds[0] != null
        ? all.find(
            (c) =>
              c.kind === "line" &&
              same(c.refId, lineIds[0]) &&
              c.tariffs.length === 1 &&
              equalIds(ids(c), ids(group)),
          )
        : null;
    append(
      line || {
        ...group,
        context:
          data.categories.find((c) => same(c.id, members[0].categoryId))
            ?.name || group.context,
      },
    );
  }
  for (const line of all.filter(
    (c) => c.kind === "line" && c.tariffs.length === 1,
  )) {
    const members = ids(line).map((id) =>
      data.products.find((p) => same(p.id, id)),
    );
    if (
      ids(line).some((id) => covered.has(String(id))) ||
      members.some((p) => p.priceGroupId == null)
    )
      continue;
    append(line);
  }
  for (const product of products)
    if (!covered.has(String(product.refId))) append(product);
  return primary;
}
export function searchCommercial(choices, query, usage = {}) {
  if (!normalizeText(query)) return [];
  return searchChoices(choices, query, usage);
}
export function specificChoices(data, query, usage = {}) {
  return searchCommercial(
    catalogChoices(data).filter((c) => c.kind === "product"),
    query,
    usage,
  );
}
export function officialCommercialChoices(snapshot) {
  const derived = commercialChoices(snapshot?.data);
  if (!Array.isArray(snapshot?.commercialOptions)) return derived;
  // La API administra la selección y el orden; las tarifas se resuelven contra su catálogo.
  return snapshot.commercialOptions
    .map((option) => derived.find((c) => c.key === option.key))
    .filter(Boolean);
}
