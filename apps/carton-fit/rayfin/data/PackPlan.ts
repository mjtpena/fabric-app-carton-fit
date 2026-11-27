import { date, decimal, entity, int, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * Immutable packing plan recorded when a packer confirms a carton (or split) for an order.
 * Row-level security restricts create to the authenticated packer; no update or delete is permitted.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.packerSub),
})
export class PackPlan {
  @uuid() id!: string;
  @uuid() packOrderId!: string;
  @uuid() cartonId!: string;
  @int() boxNo!: number;
  @text({ min: 2, max: 2000 }) placements!: string;
  @decimal() voidPct!: number;
  @int() actualGrams!: number;
  @int() dimGrams!: number;
  @int() billableGrams!: number;
  @set('auto', 'packer') source!: 'auto' | 'packer';
  @text({ min: 1, max: 255 }) packerSub!: string;
  @date() createdAt!: Date;
}
