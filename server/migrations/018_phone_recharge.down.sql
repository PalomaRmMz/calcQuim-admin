ALTER TABLE sale_items
  DROP CONSTRAINT sale_items_activity_check,
  DROP CONSTRAINT sale_items_line_type_check,
  DROP CONSTRAINT sale_reference_required,
  DROP CONSTRAINT commercial_line_integrity,
  ALTER COLUMN quantity SET NOT NULL,
  ALTER COLUMN unit SET NOT NULL,
  ALTER COLUMN price SET NOT NULL;

ALTER TABLE sale_items
  ADD CONSTRAINT sale_items_activity_check CHECK (activity IN ('LIMPIEZA', 'JARCERIA', 'LAVANDERIA')),
  ADD CONSTRAINT sale_items_line_type_check CHECK (line_type IN ('physical', 'service')),
  ADD CONSTRAINT sale_reference_required CHECK (product_id IS NOT NULL OR (record->'reference'->>'kind' IN ('line','category','priceGroup') AND record->'reference'->>'id' IS NOT NULL) OR (service_id IS NOT NULL AND record->'reference'->>'kind'='service' AND record->'reference'->>'id'=service_id)),
  ADD CONSTRAINT commercial_line_integrity CHECK (COALESCE((line_type IS NULL AND presentation_id IS NULL AND service_id IS NULL AND base_quantity IS NULL) OR (line_type='physical' AND activity='JARCERIA' AND presentation_id IS NOT NULL AND product_id IS NOT NULL AND service_id IS NULL AND base_quantity IS NOT NULL) OR (line_type='service' AND activity='LAVANDERIA' AND service_id IS NOT NULL AND product_id IS NULL AND presentation_id IS NULL AND base_quantity IS NULL) OR (line_type='physical' AND activity='LIMPIEZA' AND service_id IS NULL AND presentation_id IS NULL) OR (line_type='physical' AND activity='LIMPIEZA' AND presentation_id LIKE 'supply-bottle:%' AND product_id IS NOT NULL AND service_id IS NULL AND base_quantity=quantity AND unit='botella' AND quantity=trunc(quantity) AND record->'presentationSnapshot'->>'supplyInventory'='true'),false));

