CREATE TABLE units(code text PRIMARY KEY, dimension text NOT NULL, factor numeric NOT NULL CHECK(factor>0));
INSERT INTO units VALUES ('litro','volume',1),('mililitro','volume',0.001),('kg','mass',1),('gramo','mass',0.001),('pieza','pieza',1),('garrafa','garrafa',1),('envase','envase',1),('botella','botella',1),('bolsa','bolsa',1),('porron','porron',1);
ALTER TABLE products ADD CONSTRAINT product_unit FOREIGN KEY(unit) REFERENCES units(code);
ALTER TABLE purchased_items ADD CONSTRAINT article_unit FOREIGN KEY(unit) REFERENCES units(code);
ALTER TABLE supply_sources ADD CONSTRAINT source_unit FOREIGN KEY(purchase_unit) REFERENCES units(code);
ALTER TABLE supply_conversions ADD CONSTRAINT input_unit FOREIGN KEY(input_unit) REFERENCES units(code), ADD CONSTRAINT output_unit FOREIGN KEY(output_unit) REFERENCES units(code);
ALTER TABLE supplier_costs ADD CONSTRAINT cost_unit FOREIGN KEY(price_unit) REFERENCES units(code);
ALTER TABLE purchase_items ADD CONSTRAINT purchase_unit FOREIGN KEY(unit) REFERENCES units(code);
ALTER TABLE sale_items ADD CONSTRAINT sale_unit FOREIGN KEY(unit) REFERENCES units(code);
ALTER TABLE source_yield_overrides ADD CONSTRAINT presentation_identity CHECK (
 (record->>'presentationSourceId' IS NULL AND record->>'presentationQuantity' IS NULL)
 OR (record->>'presentationSourceId'=source_id AND (record->>'presentationQuantity')::numeric>0)
);
-- Se difiere hasta que cabecera y detalles de la transacción estén completos.
CREATE FUNCTION check_document_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE identifier text; expected numeric; actual numeric; count_items integer;
BEGIN
  IF TG_TABLE_NAME IN ('purchases','sales') THEN identifier=COALESCE(NEW.id,OLD.id);
  ELSIF TG_TABLE_NAME='purchase_items' THEN identifier=COALESCE(NEW.purchase_id,OLD.purchase_id);
  ELSE identifier=COALESCE(NEW.sale_id,OLD.sale_id); END IF;
  IF TG_TABLE_NAME IN ('purchases','purchase_items') THEN
    SELECT total INTO expected FROM purchases WHERE id=identifier;
    SELECT sum(total),count(*) INTO actual,count_items FROM purchase_items WHERE purchase_id=identifier;
  ELSE
    SELECT total INTO expected FROM sales WHERE id=identifier;
    SELECT sum(amount),count(*) INTO actual,count_items FROM sale_items WHERE sale_id=identifier;
  END IF;
  IF expected IS NOT NULL AND (count_items=0 OR abs(expected-actual)>0.011) THEN
    RAISE EXCEPTION 'document total constraint' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER purchases_total AFTER INSERT OR UPDATE ON purchases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_document_total();
CREATE CONSTRAINT TRIGGER purchase_items_total AFTER INSERT OR UPDATE OR DELETE ON purchase_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_document_total();
CREATE CONSTRAINT TRIGGER sales_total AFTER INSERT OR UPDATE ON sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_document_total();
CREATE CONSTRAINT TRIGGER sale_items_total AFTER INSERT OR UPDATE OR DELETE ON sale_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_document_total();
