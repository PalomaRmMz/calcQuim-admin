DO $$ BEGIN IF EXISTS(SELECT 1 FROM suppliers WHERE business_activity IS NOT NULL) THEN RAISE EXCEPTION 'Supplier classification rollback blocked: preserve classifications'; END IF; END $$;
ALTER TABLE suppliers DROP COLUMN business_activity;
UPDATE dataset_state SET metadata=metadata-'organizationSchema';
