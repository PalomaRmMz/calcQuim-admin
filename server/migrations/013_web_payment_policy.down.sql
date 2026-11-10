DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM sales WHERE record ? 'monetary') THEN
  RAISE EXCEPTION 'Down bloqueado: hay ventas con contexto monetario; conservar política e historial';
 END IF;
 IF EXISTS(SELECT 1 FROM web_payment_settings WHERE enabled OR jsonb_array_length(history)>0) THEN
  RAISE EXCEPTION 'Down bloqueado: configuración monetaria ya utilizada';
 END IF;
END $$;
DROP TABLE web_payment_settings;

CREATE OR REPLACE FUNCTION check_document_total() RETURNS trigger LANGUAGE plpgsql AS $$
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

ALTER FUNCTION check_document_total() SET search_path FROM CURRENT;
