ALTER TABLE sale_items
  DROP CONSTRAINT sale_items_activity_check,
  DROP CONSTRAINT sale_items_line_type_check,
  DROP CONSTRAINT sale_reference_required,
  DROP CONSTRAINT commercial_line_integrity,
  ALTER COLUMN quantity DROP NOT NULL,
  ALTER COLUMN unit DROP NOT NULL,
  ALTER COLUMN price DROP NOT NULL;

ALTER TABLE sale_items
  ADD CONSTRAINT sale_items_activity_check CHECK (activity IN ('LIMPIEZA', 'JARCERIA', 'LAVANDERIA', 'RECARGAS')),
  ADD CONSTRAINT sale_items_line_type_check CHECK (line_type IN ('physical', 'service', 'phoneRecharge')),
  ADD CONSTRAINT sale_reference_required CHECK ((line_type = 'phoneRecharge') IS TRUE OR (product_id IS NOT NULL OR (record->'reference'->>'kind' IN ('line','category','priceGroup') AND record->'reference'->>'id' IS NOT NULL) OR (service_id IS NOT NULL AND record->'reference'->>'kind'='service' AND record->'reference'->>'id'=service_id))),
  ADD CONSTRAINT commercial_line_integrity CHECK (CASE WHEN line_type = 'phoneRecharge' THEN COALESCE(
    activity = 'RECARGAS' AND product_id IS NULL AND presentation_id IS NULL AND service_id IS NULL
    AND base_quantity IS NULL AND quantity IS NULL AND unit IS NULL AND price IS NULL
    AND amount BETWEEN 0.01 AND 9999999999999.99 AND amount = trunc(amount, 2)
    AND record->>'lineType' = line_type AND record->>'activity' = activity
    AND record->'reference' = '{"kind":"phoneRecharge","id":"phone-recharge"}'::jsonb
    AND record->'amount' = to_jsonb(amount)
    AND record->>'entryMode' = 'amount'
    AND record->>'capturedValue' = (amount::numeric(15,2))::text
    AND NOT (record ?| ARRAY['quantity','unit','price','productId','presentationId','serviceId','baseQuantity']),
    false) ELSE COALESCE(
    activity IS DISTINCT FROM 'RECARGAS' AND record->'reference'->>'kind' IS DISTINCT FROM 'phoneRecharge'
    AND quantity IS NOT NULL AND unit IS NOT NULL AND price IS NOT NULL AND (COALESCE((line_type IS NULL AND presentation_id IS NULL AND service_id IS NULL AND base_quantity IS NULL) OR (line_type='physical' AND activity='JARCERIA' AND presentation_id IS NOT NULL AND product_id IS NOT NULL AND service_id IS NULL AND base_quantity IS NOT NULL) OR (line_type='service' AND activity='LAVANDERIA' AND service_id IS NOT NULL AND product_id IS NULL AND presentation_id IS NULL AND base_quantity IS NULL) OR (line_type='physical' AND activity='LIMPIEZA' AND service_id IS NULL AND presentation_id IS NULL) OR (line_type='physical' AND activity='LIMPIEZA' AND presentation_id LIKE 'supply-bottle:%' AND product_id IS NOT NULL AND service_id IS NULL AND base_quantity=quantity AND unit='botella' AND quantity=trunc(quantity) AND record->'presentationSnapshot'->>'supplyInventory'='true'),false)), false) END);

