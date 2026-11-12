import {inventoryOwner} from './inventory-policy.mjs';
// Independent read permission; does not add permissions to the inventory principal.
export function salesHistoryReader(token){const owner=inventoryOwner(token);return owner?Object.freeze({id:owner.id,permissions:Object.freeze(['sales:read'])}):null;}
