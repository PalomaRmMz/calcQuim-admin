ALTER TABLE suppliers ADD COLUMN business_activity text CHECK(business_activity IN ('LIMPIEZA','JARCERIA'));
UPDATE dataset_state SET metadata=metadata||'{"organizationSchema":1}'::jsonb;
