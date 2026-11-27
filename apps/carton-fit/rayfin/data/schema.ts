import { AppMarker } from './AppMarker.js';
import { Carton } from './Carton.js';
import { PackLine } from './PackLine.js';
import { PackOrder } from './PackOrder.js';
import { PackPlan } from './PackPlan.js';
import { Person } from './Person.js';
import { Sku } from './Sku.js';

export type AppSchema = {
  Person: Person;
  AppMarker: AppMarker;
  Carton: Carton;
  Sku: Sku;
  PackOrder: PackOrder;
  PackLine: PackLine;
  PackPlan: PackPlan;
};

export const schema = [Person, AppMarker, Carton, Sku, PackOrder, PackLine, PackPlan];
