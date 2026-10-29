-- El ejecutor rechaza down si existen registros operativos o archivos originales.
DROP TABLE migration_sources, idempotency_requests, sale_items, sales,
  purchase_receipts, purchase_revisions, purchase_items, purchases, supplier_costs,
  source_yield_overrides, supply_conversions, supply_sources, purchased_items,
  suppliers, products, price_groups, product_lines, categories, dataset_state;
