import type { EntityDefs } from '@x10/shared/data';
import { AppMarkerDef, PersonDef, type AppMarker, type Person } from '@x10/shared/identity';

export const limits = {
  cartonCode: { min: 1, max: 12 },
  cartonName: { min: 1, max: 60 },
  skuCode: { min: 1, max: 30 },
  skuName: { min: 1, max: 80 },
  orderRef: { min: 1, max: 30 },
  placements: { min: 2, max: 2000 },
} as const;

export type PackOrderStatus = 'open' | 'packed';
export type PackPlanSource = 'auto' | 'packer';

export interface Carton {
  id: string;
  code: string;
  name: string;
  innerLength: number;
  innerWidth: number;
  innerHeight: number;
  tareGrams: number;
  maxLoadGrams: number;
  unitCost: number;
  stock: number;
  reorderPoint: number;
  active: boolean;
}

export interface Sku {
  id: string;
  sku: string;
  name: string;
  length: number;
  width: number;
  height: number;
  weightGrams: number;
  fragile: boolean;
  keepUpright: boolean;
  stackLimitGrams: number;
  verified: boolean;
  verifiedBy: string | null;
}

export interface PackOrder {
  id: string;
  ref: string;
  createdAt: string;
  status: PackOrderStatus;
  packerSub: string | null;
  packedAt: string | null;
}

export interface PackLine {
  id: string;
  packOrderId: string;
  skuId: string;
  qty: number;
}

export interface PackPlan {
  id: string;
  packOrderId: string;
  cartonId: string;
  boxNo: number;
  placements: string;
  voidPct: number;
  actualGrams: number;
  dimGrams: number;
  billableGrams: number;
  source: PackPlanSource;
  packerSub: string;
  createdAt: string;
}

export type Schema = {
  Person: Person;
  AppMarker: AppMarker;
  Carton: Carton;
  Sku: Sku;
  PackOrder: PackOrder;
  PackLine: PackLine;
  PackPlan: PackPlan;
};

export const defs: EntityDefs<Schema> = {
  Person: PersonDef,
  AppMarker: AppMarkerDef,
  Carton: {
    name: 'Carton',
    fields: {
      id: 'uuid',
      code: 'text',
      name: 'text',
      innerLength: 'int',
      innerWidth: 'int',
      innerHeight: 'int',
      tareGrams: 'int',
      maxLoadGrams: 'int',
      unitCost: 'decimal',
      stock: 'int',
      reorderPoint: 'int',
      active: 'bool',
    },
  },
  Sku: {
    name: 'Sku',
    fields: {
      id: 'uuid',
      sku: 'text',
      name: 'text',
      length: 'int',
      width: 'int',
      height: 'int',
      weightGrams: 'int',
      fragile: 'bool',
      keepUpright: 'bool',
      stackLimitGrams: 'int',
      verified: 'bool',
      verifiedBy: 'text',
    },
  },
  PackOrder: {
    name: 'PackOrder',
    fields: {
      id: 'uuid',
      ref: 'text',
      createdAt: 'date',
      status: 'text',
      packerSub: 'text',
      packedAt: 'date',
    },
  },
  PackLine: {
    name: 'PackLine',
    fields: {
      id: 'uuid',
      packOrderId: 'uuid',
      skuId: 'uuid',
      qty: 'int',
    },
  },
  PackPlan: {
    name: 'PackPlan',
    fields: {
      id: 'uuid',
      packOrderId: 'uuid',
      cartonId: 'uuid',
      boxNo: 'int',
      placements: 'text',
      voidPct: 'decimal',
      actualGrams: 'int',
      dimGrams: 'int',
      billableGrams: 'int',
      source: 'text',
      packerSub: 'text',
      createdAt: 'date',
    },
  },
};
