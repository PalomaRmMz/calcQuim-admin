-- Solo aplicar en operativo con autorización expresa y respaldo verificado.
ALTER TABLE sale_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE sale_items DROP CONSTRAINT sale_items_sale_id_product_id_key;
ALTER TABLE inventory_pending ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE inventory_pending DROP CONSTRAINT inventory_pending_scope_check;
ALTER TABLE inventory_pending ADD CONSTRAINT inventory_pending_scope_check CHECK(scope IN ('product','line','category','priceGroup'));
ALTER TABLE inventory_pending DROP CONSTRAINT inventory_pending_sale_id_ordinal_key;
CREATE UNIQUE INDEX inventory_pending_active_line ON inventory_pending(sale_id,ordinal) WHERE state IN ('pending','resolved');
ALTER TABLE sale_items ADD CONSTRAINT sale_reference_required CHECK(product_id IS NOT NULL OR (record->'reference'->>'kind' IN ('line','category','priceGroup') AND record->'reference'->>'id' IS NOT NULL));
