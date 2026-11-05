-- Do not discard configured prices. A rollback requires an explicit empty state.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM price_groups WHERE wholesale_price IS NOT NULL)
 OR EXISTS (SELECT 1 FROM products WHERE wholesale_price IS NOT NULL)
 OR EXISTS (SELECT 1 FROM sale_items WHERE record->>'pricingVersion' = 'admin-sales-wholesale-v2')
 THEN RAISE EXCEPTION 'Rollback blocked: wholesale configuration or history exists'; END IF;
END $$;
ALTER TABLE products DROP COLUMN wholesale_price;
ALTER TABLE price_groups DROP COLUMN wholesale_price;
UPDATE dataset_state SET metadata = metadata - 'wholesalePricing' - 'wholesalePricingSchema';
