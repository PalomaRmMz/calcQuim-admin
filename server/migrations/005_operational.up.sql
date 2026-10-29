ALTER TABLE dataset_state DROP CONSTRAINT dataset_state_purpose_check;
ALTER TABLE dataset_state ADD CONSTRAINT dataset_state_purpose_check CHECK(purpose IN ('synthetic','migration_rehearsal','operational'));
