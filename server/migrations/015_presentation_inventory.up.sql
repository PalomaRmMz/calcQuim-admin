CREATE TABLE inventory_presentation_ledger (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL,
  presentation_id text NOT NULL,
  factor bigint NOT NULL CHECK (factor > 0),
  delta bigint NOT NULL,
  balance bigint NOT NULL CHECK (balance >= 0),
  movement_id uuid UNIQUE REFERENCES inventory_movements(id),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (presentation_id,product_id) REFERENCES commercial_presentations(id,product_id)
);
CREATE INDEX inventory_presentation_ledger_latest ON inventory_presentation_ledger(product_id,presentation_id,seq DESC);
