ALTER TABLE supply_inventory DROP COLUMN package_label;
ALTER TABLE supply_inventory DROP CONSTRAINT supply_inventory_bottle_liters_check;
ALTER TABLE supply_inventory ADD CONSTRAINT supply_inventory_bottle_liters_check CHECK (bottle_liters = 1);
