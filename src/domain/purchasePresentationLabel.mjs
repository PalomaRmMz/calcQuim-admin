export function purchasePresentationLabel(presentation, products) {
 const name=products.find(p=>String(p.id)===String(presentation.productId))?.name;
 return name && !presentation.name.toLocaleLowerCase('es').includes(name.toLocaleLowerCase('es'))
  ? `${name} · ${presentation.name}` : presentation.name;
}
