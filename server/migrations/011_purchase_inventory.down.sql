DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM purchase_inventory) THEN RAISE EXCEPTION 'Conserva la trazabilidad de compras'; END IF;
END $$;
DROP TABLE purchase_inventory;
UPDATE inventory_settings SET policy=policy-'purchaseAutomation';
