DO $$ BEGIN IF EXISTS(SELECT 1 FROM commercial_presentations) OR EXISTS(SELECT 1 FROM commercial_services) OR EXISTS(SELECT 1 FROM sale_items WHERE line_type IS NOT NULL) THEN RAISE EXCEPTION 'Commerce rollback blocked: preserve commercial history'; END IF; END $$;
ALTER TABLE sale_items DROP CONSTRAINT commercial_line_integrity;
ALTER TABLE sale_items DROP CONSTRAINT sale_reference_required;
ALTER TABLE sale_items DROP COLUMN presentation_id,DROP COLUMN service_id,DROP COLUMN base_quantity,DROP COLUMN activity,DROP COLUMN line_type;
ALTER TABLE sale_items ADD CONSTRAINT sale_reference_required CHECK(product_id IS NOT NULL OR (record->'reference'->>'kind' IN ('line','category','priceGroup') AND record->'reference'->>'id' IS NOT NULL));
ALTER TABLE products DROP CONSTRAINT hardware_presentation_pricing,DROP CONSTRAINT product_physical_unit,DROP COLUMN activity;
DROP TABLE commercial_presentations,commercial_services;
UPDATE dataset_state SET metadata=metadata-'commerceSchema';
DELETE FROM units WHERE code IN ('paquete','carga','servicio');
