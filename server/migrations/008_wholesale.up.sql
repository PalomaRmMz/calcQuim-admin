-- Nullable, no invented rates and no changes to historical sale records.
ALTER TABLE price_groups ADD COLUMN wholesale_price numeric CHECK (wholesale_price > 0 AND wholesale_price <= price);
ALTER TABLE products ADD COLUMN wholesale_price numeric CHECK (wholesale_price IS NULL OR (price IS NOT NULL AND wholesale_price > 0 AND wholesale_price <= price AND price_group_id IS NULL AND unit = 'litro'));
-- Schema readiness is separate from explicit commercial activation.
UPDATE dataset_state SET metadata = metadata || '{"wholesalePricingSchema":2}'::jsonb;
