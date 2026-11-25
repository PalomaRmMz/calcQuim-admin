DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM inventory_presentation_ledger) THEN
    RAISE EXCEPTION 'Conserva el historial de inventario por presentación';
  END IF;
END $$;
DROP TABLE inventory_presentation_ledger;
