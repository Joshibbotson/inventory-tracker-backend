import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Material } from 'src/modules/materials/schemas/material.schema';
import { Unit } from 'src/modules/units/schemas/unit.schema';
import { User } from 'src/modules/user/schemas/User.schema';

export type StockAdjustmentDocument = HydratedDocument<StockAdjustment>;

export enum AdjustmentType {
  PURCHASE = 'purchase',
  WASTE = 'waste',
  CORRECTION = 'correction',
  RETURN = 'return',
  PRODUCTION = 'production',
  SALE = 'sale',
}

@Schema({ timestamps: true })
export class StockAdjustment {
  @Prop({ type: Types.ObjectId, ref: 'Material', required: true })
  material: Material;

  @Prop({ required: true, enum: AdjustmentType })
  adjustmentType: AdjustmentType;

  @Prop({ required: true })
  quantity: number; // Can be positive or negative

  @Prop({ type: Types.ObjectId, ref: 'Unit', required: true })
  unit: Unit;

  @Prop()
  notes: string;

  @Prop({ min: 0 })
  cost: number; // For purchases

  @Prop({ type: Types.ObjectId, ref: 'User' })
  adjustedBy: User;

  @Prop({ type: Types.ObjectId, ref: 'Product' })
  relatedProduct: Types.ObjectId; // If adjustment is from a sale

  @Prop({ required: true })
  previousStock: number; // Stock level before adjustment

  @Prop({ required: true })
  newStock: number; // Stock level after adjustment
}

export const StockAdjustmentSchema =
  SchemaFactory.createForClass(StockAdjustment);

// Index for querying adjustment history
StockAdjustmentSchema.index({ material: 1, createdAt: -1 });
StockAdjustmentSchema.index({ adjustmentType: 1, createdAt: -1 });
