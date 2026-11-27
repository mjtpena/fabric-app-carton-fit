import { entity, int, role, uuid } from '@microsoft/rayfin-core';

/**
 * Line item on a PackOrder linking a SKU and quantity.
 * Order-ownership checks are enforced in src/domain/cartonFit.ts.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create')
@role('authenticated', 'update')
@role('authenticated', 'delete')
export class PackLine {
  @uuid() id!: string;
  @uuid() packOrderId!: string;
  @uuid() skuId!: string;
  @int() qty!: number;
}
