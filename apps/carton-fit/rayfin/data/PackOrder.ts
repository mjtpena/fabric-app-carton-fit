import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * Customer order awaiting or having completed cartonisation at the packing bench.
 * Claiming and ownership checks on update are enforced in src/domain/cartonFit.ts.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create')
@role('authenticated', 'update', { exclude: ['createdAt'] })
export class PackOrder {
  @uuid() id!: string;
  @text({ min: 1, max: 30 }) ref!: string;
  @date() createdAt!: Date;
  @set('open', 'packed') status!: 'open' | 'packed';
  @text({ max: 255, optional: true }) packerSub?: string;
  @date({ optional: true }) packedAt?: Date;
}
