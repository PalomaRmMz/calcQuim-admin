DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM inventory_movements) OR EXISTS(SELECT 1 FROM inventory_pending) OR EXISTS(SELECT 1 FROM inventory_accounts) OR EXISTS(SELECT 1 FROM inventory_replenishment) OR EXISTS(SELECT 1 FROM inventory_changes) THEN
    RAISE EXCEPTION 'Down bloqueado: existe información de inventario';
  END IF;
END $$;
DROP TABLE inventory_allocations,inventory_pending,inventory_replenishment,inventory_changes;
ALTER TABLE inventory_accounts DROP CONSTRAINT inventory_anchor_fk;
DROP TABLE inventory_movements,inventory_accounts,inventory_settings;
DROP FUNCTION inventory_immutable();
DROP FUNCTION inventory_validate_link();
