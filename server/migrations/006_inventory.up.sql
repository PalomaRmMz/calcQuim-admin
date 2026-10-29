-- Sin semillas de productos, saldos, movimientos o ventas históricas.
CREATE TABLE inventory_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  sales_enabled boolean NOT NULL DEFAULT true,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO inventory_settings(singleton,policy) VALUES(true,'{"unknown":"anchor_at_capture","negative":"allow_warn","void":"physical_confirmation","amount":"confirm_quantity","purchase":"explicit_receipt","group":"preserve_financial_line"}');
CREATE TABLE inventory_accounts (
  product_id text PRIMARY KEY REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
  unit text NOT NULL,
  anchor_id uuid,
  UNIQUE(product_id,unit)
);
CREATE TABLE inventory_movements (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  product_id text NOT NULL REFERENCES inventory_accounts(product_id),
  kind text NOT NULL CHECK(kind IN ('estimate','prepared','receipt','adjustment','waste','sale','return','correction','reversal')),
  quantity numeric NOT NULL CHECK(quantity <> 0 OR kind='estimate'),
  unit text NOT NULL,
  certainty text NOT NULL CHECK(certainty IN ('estimated','confirmed')),
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  purchase_id text REFERENCES purchases(id) DEFERRABLE INITIALLY DEFERRED,
  sale_id text REFERENCES sales(id) DEFERRABLE INITIALLY DEFERRED,
  sale_ordinal integer CHECK(sale_ordinal >= 0),
  reversal_of uuid UNIQUE REFERENCES inventory_movements(id),
  origin_key text UNIQUE,
  reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK((kind='reversal') = (reversal_of IS NOT NULL)),
  CHECK(kind <> 'estimate' OR (quantity >= 0 AND certainty='estimated')),
  CHECK(kind NOT IN ('prepared','receipt','return') OR quantity>0),
  CHECK(kind NOT IN ('waste','sale') OR quantity<0)
);
ALTER TABLE inventory_movements ADD FOREIGN KEY(product_id,unit) REFERENCES inventory_accounts(product_id,unit);
ALTER TABLE inventory_movements ADD FOREIGN KEY(sale_id,sale_ordinal) REFERENCES sale_items(sale_id,ordinal) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE inventory_accounts ADD CONSTRAINT inventory_anchor_fk FOREIGN KEY(anchor_id) REFERENCES inventory_movements(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE inventory_pending (
  id uuid PRIMARY KEY,
  sale_id text NOT NULL REFERENCES sales(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal integer NOT NULL CHECK(ordinal>=0),
  product_id text NOT NULL REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
  scope text NOT NULL CHECK(scope IN ('product','line','category')),
  scope_id text NOT NULL,
  quantity numeric CHECK(quantity>0),
  unit text NOT NULL,
  reason text NOT NULL CHECK(reason IN ('group','amount','quantity_review')),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','resolved','cancelled')),
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sale_id,ordinal)
);
ALTER TABLE inventory_pending ADD FOREIGN KEY(sale_id,ordinal) REFERENCES sale_items(sale_id,ordinal) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE inventory_allocations (
  id uuid PRIMARY KEY,
  pending_id uuid NOT NULL REFERENCES inventory_pending(id),
  product_id text NOT NULL REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
  quantity numeric NOT NULL CHECK(quantity>0),
  unit text NOT NULL,
  movement_id uuid NOT NULL UNIQUE REFERENCES inventory_movements(id),
  UNIQUE(pending_id,product_id)
);
CREATE TABLE inventory_replenishment (
  product_id text PRIMARY KEY REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
  minimum numeric CHECK(minimum>=0),
  usual_batch numeric CHECK(usual_batch>0),
  unit text NOT NULL
);
CREATE TABLE inventory_changes (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action text NOT NULL,
  reference jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION inventory_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Inventario inmutable: utilizar movimientos compensatorios' USING ERRCODE='23514'; END $$;
CREATE TRIGGER inventory_movements_immutable BEFORE UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_changes_immutable BEFORE UPDATE OR DELETE ON inventory_changes FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE INDEX inventory_movements_product_seq ON inventory_movements(product_id,seq);
CREATE INDEX inventory_movements_sale ON inventory_movements(sale_id,sale_ordinal);
CREATE INDEX inventory_movements_purchase ON inventory_movements(purchase_id);
CREATE INDEX inventory_pending_state ON inventory_pending(state,created_at);
CREATE FUNCTION inventory_validate_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original inventory_movements;
BEGIN
  IF TG_TABLE_NAME='inventory_accounts' THEN
    IF NEW.anchor_id IS NOT NULL THEN
      SELECT * INTO original FROM inventory_movements WHERE id=NEW.anchor_id;
      IF original.product_id IS DISTINCT FROM NEW.product_id OR original.kind IS DISTINCT FROM 'estimate' THEN RAISE EXCEPTION 'Ancla de inventario invalida' USING ERRCODE='23514'; END IF;
    END IF;
  ELSE
    IF NEW.reversal_of IS NOT NULL THEN
      SELECT * INTO original FROM inventory_movements WHERE id=NEW.reversal_of;
      IF original.kind IN ('estimate','reversal') OR original.product_id IS DISTINCT FROM NEW.product_id OR original.unit IS DISTINCT FROM NEW.unit OR original.quantity IS DISTINCT FROM -NEW.quantity THEN RAISE EXCEPTION 'Reversa de inventario invalida' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION inventory_validate_link() SET search_path FROM CURRENT;
CREATE CONSTRAINT TRIGGER inventory_anchor_valid AFTER INSERT OR UPDATE ON inventory_accounts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_validate_link();
CREATE TRIGGER inventory_reversal_valid BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION inventory_validate_link();
