CREATE TABLE dataset_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  generation uuid NOT NULL DEFAULT gen_random_uuid(), revision bigint NOT NULL DEFAULT 0,
  purpose text NOT NULL CHECK(purpose = 'synthetic'),
  metadata jsonb NOT NULL DEFAULT '{"version":1,"supplyConfigurationVersion":3,"supplyModelVersion":2}',
  counters jsonb NOT NULL DEFAULT '{}'
);
INSERT INTO dataset_state(singleton,purpose) VALUES(true,'synthetic');
CREATE TABLE categories (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  name_key text NOT NULL UNIQUE, CHECK (btrim(record->>'name') <> '')
);
CREATE TABLE product_lines (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  category_id text NOT NULL REFERENCES categories(id) DEFERRABLE INITIALLY DEFERRED,
  name_key text NOT NULL, UNIQUE(category_id,name_key), UNIQUE(id,category_id)
);
CREATE TABLE price_groups (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  name_key text NOT NULL UNIQUE, price numeric NOT NULL CHECK(price >= 0)
);
CREATE TABLE products (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  category_id text REFERENCES categories(id) DEFERRABLE INITIALLY DEFERRED,
  line_id text, price_group_id text REFERENCES price_groups(id) DEFERRABLE INITIALLY DEFERRED,
  name_key text NOT NULL, unit text NOT NULL,
  price numeric CHECK(price >= 0),
  FOREIGN KEY(line_id,category_id) REFERENCES product_lines(id,category_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK(line_id IS NULL OR category_id IS NOT NULL),
  CHECK(price_group_id IS NULL OR price IS NULL),
  UNIQUE NULLS NOT DISTINCT(category_id,line_id,name_key)
);
CREATE TABLE suppliers (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  name_key text NOT NULL UNIQUE
);
CREATE TABLE purchased_items (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  sourcing_type text NOT NULL CHECK(sourcing_type IN ('READY_TO_USE','BASE','CONCENTRATE','HYDRONEO','OTHER')),
  unit text NOT NULL
);
CREATE TABLE supply_sources (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  purchased_item_id text NOT NULL REFERENCES purchased_items(id) DEFERRABLE INITIALLY DEFERRED,
  supplier_id text NOT NULL REFERENCES suppliers(id) DEFERRABLE INITIALLY DEFERRED,
  purchase_unit text NOT NULL, purchase_quantity numeric CHECK(purchase_quantity > 0),
  identity_key text NOT NULL UNIQUE, UNIQUE(id,purchased_item_id), UNIQUE(id,supplier_id)
);
CREATE TABLE supply_conversions (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  purchased_item_id text NOT NULL REFERENCES purchased_items(id) DEFERRABLE INITIALLY DEFERRED,
  output_product_id text NOT NULL REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
  input_quantity numeric CHECK(input_quantity > 0), input_unit text,
  output_quantity numeric CHECK(output_quantity > 0), output_unit text,
  CHECK(num_nonnulls(input_quantity,input_unit,output_quantity,output_unit) IN (0,4)),
  UNIQUE(purchased_item_id,output_product_id), UNIQUE(id,purchased_item_id)
);
CREATE TABLE source_yield_overrides (
  source_id text NOT NULL, conversion_id text NOT NULL, purchased_item_id text NOT NULL,
  record jsonb NOT NULL, input_quantity numeric NOT NULL CHECK(input_quantity > 0),
  output_quantity numeric NOT NULL CHECK(output_quantity > 0),
  PRIMARY KEY(source_id,conversion_id),
  FOREIGN KEY(source_id,purchased_item_id) REFERENCES supply_sources(id,purchased_item_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(conversion_id,purchased_item_id) REFERENCES supply_conversions(id,purchased_item_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE supplier_costs (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  source_id text NOT NULL, supplier_id text NOT NULL,
  price numeric NOT NULL CHECK(price >= 0), price_quantity numeric NOT NULL CHECK(price_quantity > 0),
  price_unit text NOT NULL, quoted_at date NOT NULL, valid_until date,
  FOREIGN KEY(source_id,supplier_id) REFERENCES supply_sources(id,supplier_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK(valid_until IS NULL OR valid_until >= quoted_at)
);
CREATE TABLE purchases (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  supplier_id text NOT NULL REFERENCES suppliers(id) DEFERRABLE INITIALLY DEFERRED,
  date date NOT NULL, total numeric NOT NULL CHECK(total >= 0)
);
CREATE TABLE purchase_items (
  purchase_id text NOT NULL REFERENCES purchases(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal integer NOT NULL CHECK(ordinal >= 0), legacy_id text, record jsonb NOT NULL,
  source_id text REFERENCES supply_sources(id) DEFERRABLE INITIALLY DEFERRED,
  purchased_item_id text REFERENCES purchased_items(id) DEFERRABLE INITIALLY DEFERRED,
  product_id text REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
  quantity numeric NOT NULL CHECK(quantity > 0), unit text NOT NULL,
  total numeric NOT NULL CHECK(total >= 0), PRIMARY KEY(purchase_id,ordinal), UNIQUE(purchase_id,legacy_id)
);
CREATE TABLE purchase_revisions (
  purchase_id text NOT NULL REFERENCES purchases(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal integer NOT NULL, record jsonb NOT NULL, PRIMARY KEY(purchase_id,ordinal)
);
CREATE TABLE purchase_receipts (
  purchase_id text PRIMARY KEY REFERENCES purchases(id) DEFERRABLE INITIALLY DEFERRED,
  record jsonb NOT NULL, sha256 text NOT NULL
);
CREATE TABLE sales (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  folio text UNIQUE, date date NOT NULL, total numeric NOT NULL CHECK(total >= 0)
);
CREATE TABLE sale_items (
  sale_id text NOT NULL REFERENCES sales(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal integer NOT NULL, product_id text NOT NULL REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
  record jsonb NOT NULL, quantity numeric NOT NULL CHECK(quantity > 0), unit text NOT NULL,
  price numeric NOT NULL CHECK(price >= 0), amount numeric NOT NULL CHECK(amount >= 0),
  PRIMARY KEY(sale_id,ordinal), UNIQUE(sale_id,product_id)
);
CREATE TABLE idempotency_requests (
  request_key text PRIMARY KEY, request_hash text NOT NULL,
  response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE migration_sources (
  sha256 text PRIMARY KEY, raw_text text NOT NULL, report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category ON products(category_id);
CREATE INDEX products_line ON products(line_id);
CREATE INDEX products_price_group ON products(price_group_id);
CREATE INDEX sources_supplier ON supply_sources(supplier_id);
CREATE INDEX sources_article ON supply_sources(purchased_item_id);
CREATE INDEX conversions_product ON supply_conversions(output_product_id);
CREATE INDEX overrides_conversion ON source_yield_overrides(conversion_id);
CREATE INDEX costs_source_date ON supplier_costs(source_id,quoted_at DESC);
CREATE INDEX purchases_supplier_date ON purchases(supplier_id,date DESC);
CREATE INDEX purchases_date ON purchases(date DESC);
CREATE INDEX purchase_items_source ON purchase_items(source_id);
CREATE INDEX sale_items_product ON sale_items(product_id);
CREATE INDEX sales_date ON sales(date DESC);
