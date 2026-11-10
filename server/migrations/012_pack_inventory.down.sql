DO $$ BEGIN IF EXISTS(SELECT 1 FROM inventory_pack_events) THEN RAISE EXCEPTION 'Conserva el historial físico de paquetes'; END IF; END $$;
DROP TABLE inventory_pack_events;
DROP TABLE inventory_pack_accounts;
UPDATE inventory_settings SET policy=policy-'packAutomation';
