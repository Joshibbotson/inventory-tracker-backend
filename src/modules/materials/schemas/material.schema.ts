import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Unit } from 'src/modules/units/schemas/unit.schema';

export type MaterialDocument = HydratedDocument<Material>;

export enum MaterialCategory {
  WAX = 'wax',
  WICK = 'wick',
  FRAGRANCE = 'fragrance',
  DYE = 'dye',
  CONTAINER = 'container',
  LABEL = 'label',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class Material {
  _id?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  sku: string;

  @Prop({ type: Types.ObjectId, ref: 'Unit', required: true })
  unit: Unit;

  @Prop({ required: true, default: 0, min: 0 })
  currentStock: number;

  @Prop({ required: true, default: 0, min: 0 })
  minimumStock: number;

  @Prop({ default: 0, min: 0 })
  averageCost: number;

  @Prop()
  supplier: string;

  @Prop({ required: true, enum: MaterialCategory })
  category: MaterialCategory;

  @Prop()
  notes: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const MaterialSchema = SchemaFactory.createForClass(Material);

// Add index for faster queries
MaterialSchema.index({ category: 1, isActive: 1 });
MaterialSchema.index({ currentStock: 1, minimumStock: 1 });
