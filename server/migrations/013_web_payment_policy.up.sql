-- Aditiva: no modifica ventas, cobros ni inventarios existentes.
CREATE TABLE web_payment_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 policy_version text NOT NULL CHECK(policy_version='web-cash-nearest-50-min-50-v2'),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(history)='array')
);
INSERT INTO web_payment_settings(singleton,policy_version,enabled) VALUES(true,'web-cash-nearest-50-min-50-v2',false);

-- Preserve legacy/purchase equality; validate the separately recorded collection
-- for new web sales instead of treating rounding as a physical sale item.
CREATE OR REPLACE FUNCTION check_document_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE identifier text; expected numeric; actual numeric; count_items integer;
 document jsonb; monetary jsonb; calculated numeric; adjustment numeric; collected numeric; wanted numeric;
BEGIN
 IF TG_TABLE_NAME IN ('purchases','sales') THEN identifier=COALESCE(NEW.id,OLD.id);
 ELSIF TG_TABLE_NAME='purchase_items' THEN identifier=COALESCE(NEW.purchase_id,OLD.purchase_id);
 ELSE identifier=COALESCE(NEW.sale_id,OLD.sale_id); END IF;
 IF TG_TABLE_NAME IN ('purchases','purchase_items') THEN
  SELECT total INTO expected FROM purchases WHERE id=identifier;
  SELECT sum(total),count(*) INTO actual,count_items FROM purchase_items WHERE purchase_id=identifier;
 ELSE
  SELECT total,record INTO expected,document FROM sales WHERE id=identifier;
  SELECT sum(amount),count(*) INTO actual,count_items FROM sale_items WHERE sale_id=identifier;
  IF document ? 'monetary' THEN
   monetary=document->'monetary';
   IF jsonb_typeof(monetary) IS DISTINCT FROM 'object'
    OR COALESCE(monetary->>'policyVersion','') NOT IN ('web-cash-nearest-50-v1','web-cash-nearest-50-min-50-v2')
    OR monetary->>'currency' IS DISTINCT FROM 'MXN'
    OR document->>'origin' IS DISTINCT FROM 'WEB'
    OR COALESCE(document->>'payment','') NOT IN ('Efectivo','Transferencia','Tarjeta')
    OR monetary->>'payment' IS DISTINCT FROM document->>'payment'
    OR jsonb_typeof(monetary->'calculatedCents') IS DISTINCT FROM 'number'
    OR jsonb_typeof(monetary->'roundingCents') IS DISTINCT FROM 'number'
    OR jsonb_typeof(monetary->'collectedCents') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'web payment metadata constraint' USING ERRCODE='23514';
   END IF;
   calculated=(monetary->>'calculatedCents')::numeric;
   adjustment=(monetary->>'roundingCents')::numeric;
   collected=(monetary->>'collectedCents')::numeric;
   wanted=CASE WHEN document->>'payment'<>'Efectivo' THEN calculated
    WHEN monetary->>'policyVersion'='web-cash-nearest-50-min-50-v2' AND calculated>0 AND calculated<25 THEN 50
    ELSE floor((calculated+25)/50)*50 END;
   IF count_items=0 OR calculated<0 OR calculated>9007199254740991 OR calculated<>trunc(calculated)
    OR collected<0 OR collected>9007199254740991 OR collected<>trunc(collected)
    OR actual*100 IS DISTINCT FROM calculated OR collected IS DISTINCT FROM wanted
    OR adjustment IS DISTINCT FROM collected-calculated
    OR expected IS DISTINCT FROM collected/100
    OR (document->>'total')::numeric IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'web payment total constraint' USING ERRCODE='23514';
   END IF;
   RETURN NULL;
  END IF;
 END IF;
 IF expected IS NOT NULL AND (count_items=0 OR abs(expected-actual)>0.011) THEN
  RAISE EXCEPTION 'document total constraint' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

ALTER FUNCTION check_document_total() SET search_path FROM CURRENT;
