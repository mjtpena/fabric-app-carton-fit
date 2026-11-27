import { boolean, entity, int, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * Product SKU with verified physical dimensions and handling constraints.
 * Admin-only dimension updates and weigh-in unverify transitions are enforced in src/domain/cartonFit.ts.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create')
@role('authenticated', 'update')
@role('authenticated', 'delete')
export class Sku {
  @uuid() id!: string;
  @text({ min: 1, max: 30 }) sku!: string;
  @text({ min: 1, max: 80 }) name!: string;
  @int() length!: number;
  @int() width!: number;
  @int() height!: number;
  @int() weightGrams!: number;
  @boolean() fragile!: boolean;
  @boolean() keepUpright!: boolean;
  @int() stackLimitGrams!: number;
  @boolean() verified!: boolean;
  @text({ max: 255, optional: true }) verifiedBy?: string;
}
