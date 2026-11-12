import { createHash } from 'node:crypto';
// Existing owner's credential binding. No plaintext credential; no environment write switch.
const ownerCredentialSha256 = 'ef7ee6021b560d8e95531df086eb555d10a118950e6c22b2ea2d95808cd917a2';
export const inventoryWritesAuthorized = true;
const owner = Object.freeze({ id: 'inventory-owner', name: 'Propietario', permissions: Object.freeze(['inventory:initial', 'inventory:count', 'hardware:create']) });
export function inventoryOwner(token) {
  return typeof token === 'string' && createHash('sha256').update(token).digest('hex') === ownerCredentialSha256 ? owner : null;
}
