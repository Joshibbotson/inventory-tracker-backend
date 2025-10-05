import { Material } from '../schemas/material.schema';

export type CreateMaterial = Partial<
  Omit<Material, 'currentStock | averageCost'>
>;
