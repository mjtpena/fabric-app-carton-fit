import { boolean, decimal, entity, int, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * Standard shipping carton in the packaging library.
 * Admin-only writes are enforced in src/domain/cartonFit.ts (documented in README Known limits).
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create')
@role('authenticated', 'update')
@role('authenticated', 'delete')
export class Carton {
  @uuid() id!: string;
  @text({ min: 1, max: 12 }) code!: string;
  @text({ min: 1, max: 60 }) name!: string;
  @int() innerLength!: number;
  @int() innerWidth!: number;
  @int() innerHeight!: number;
  @int() tareGrams!: number;
  @int() maxLoadGrams!: number;
  @decimal() unitCost!: number;
  @int() stock!: number;
  @int() reorderPoint!: number;
  @boolean() active!: boolean;
}
