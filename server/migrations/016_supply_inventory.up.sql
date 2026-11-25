CREATE TABLE supply_inventory (
  purchased_item_id text PRIMARY KEY REFERENCES purchased_items(id),
  product_id text UNIQUE NOT NULL REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
  output_product_id text NOT NULL REFERENCES products(id),
  bottle_liters numeric NOT NULL CHECK (bottle_liters = 1),
  closed bigint NOT NULL CHECK (closed >= 0),
  stock_version bigint NOT NULL DEFAULT 1 CHECK (stock_version > 0),
  enabled_at timestamptz NOT NULL DEFAULT now(),
  CHECK (product_id <> output_product_id)
);
ALTER TABLE sale_items DROP CONSTRAINT commercial_line_integrity;
ALTER TABLE sale_items ADD CONSTRAINT commercial_line_integrity CHECK(COALESCE((line_type IS NULL AND presentation_id IS NULL AND service_id IS NULL AND base_quantity IS NULL) OR (line_type='physical' AND activity='JARCERIA' AND presentation_id IS NOT NULL AND product_id IS NOT NULL AND service_id IS NULL AND base_quantity IS NOT NULL) OR (line_type='service' AND activity='LAVANDERIA' AND service_id IS NOT NULL AND product_id IS NULL AND presentation_id IS NULL AND base_quantity IS NULL) OR (line_type='physical' AND activity='LIMPIEZA' AND service_id IS NULL AND presentation_id IS NULL) OR (line_type='physical' AND activity='LIMPIEZA' AND presentation_id LIKE 'supply-bottle:%' AND product_id IS NOT NULL AND service_id IS NULL AND base_quantity=quantity AND unit='botella' AND quantity=trunc(quantity) AND record->'presentationSnapshot'->>'supplyInventory'='true'),false));
