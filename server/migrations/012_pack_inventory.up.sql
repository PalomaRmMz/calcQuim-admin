-- No semillas, inferencias de composición ni cambios de inventarios históricos.
CREATE TABLE inventory_pack_accounts (
 product_id text PRIMARY KEY REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
 presentation_id text REFERENCES commercial_presentations(id) DEFERRABLE INITIALLY DEFERRED,
 factor bigint CHECK(factor>1), known boolean NOT NULL DEFAULT false,
 closed_packages bigint CHECK(closed_packages>=0),loose_units bigint CHECK(loose_units>=0),
 version bigint NOT NULL DEFAULT 0,
 CHECK(NOT known OR (presentation_id IS NOT NULL AND factor IS NOT NULL AND closed_packages IS NOT NULL AND loose_units IS NOT NULL))
);
CREATE TABLE inventory_pack_events (
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 product_id text NOT NULL REFERENCES inventory_pack_accounts(product_id),
 movement_id uuid REFERENCES inventory_movements(id) DEFERRABLE INITIALLY DEFERRED,
 action text NOT NULL,before_state jsonb NOT NULL,after_state jsonb NOT NULL,
 reference jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(movement_id,action)
);
CREATE INDEX inventory_pack_events_product ON inventory_pack_events(product_id,seq);
CREATE TRIGGER inventory_pack_events_immutable BEFORE UPDATE OR DELETE ON inventory_pack_events FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
UPDATE inventory_settings SET policy=policy||'{"packAutomation":{"enabled":false}}'::jsonb;
