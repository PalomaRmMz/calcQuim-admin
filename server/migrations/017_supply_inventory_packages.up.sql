ALTER TABLE supply_inventory DROP CONSTRAINT supply_inventory_bottle_liters_check;
ALTER TABLE supply_inventory ADD CONSTRAINT supply_inventory_bottle_liters_check
  CHECK (bottle_liters > 0 AND bottle_liters = trunc(bottle_liters, 6));
ALTER TABLE supply_inventory ADD COLUMN package_label text CHECK (btrim(package_label) <> '');
