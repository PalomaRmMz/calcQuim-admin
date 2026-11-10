-- Seguimiento nuevo, sin recontabilizar compras ni alterar movimientos históricos.
CREATE TABLE purchase_inventory (
 purchase_id text NOT NULL REFERENCES purchases(id) DEFERRABLE INITIALLY DEFERRED,
 item_id text NOT NULL, ordinal integer NOT NULL CHECK(ordinal>=0),
 product_id text REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
 activity text NOT NULL CHECK(activity IN ('LIMPIEZA','JARCERIA')),
 state text NOT NULL CHECK(state IN ('reconcile','prepare','applied','included','cancelled','returned')),
 nature text NOT NULL CHECK(nature IN ('finished','input','ambiguous')),
 source jsonb NOT NULL, fingerprint text NOT NULL,
 quantity numeric CHECK(quantity>0), unit text,
 actual_quantity numeric CHECK(actual_quantity>0),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 historical boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(purchase_id,item_id)
);
CREATE INDEX purchase_inventory_state ON purchase_inventory(state,activity);
-- La activación explícita concilia el corte en una sola transacción.
UPDATE inventory_settings SET policy=policy||'{"purchaseAutomation":{"enabled":false}}'::jsonb;
