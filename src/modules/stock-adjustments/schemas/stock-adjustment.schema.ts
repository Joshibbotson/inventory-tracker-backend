import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Material } from '../../materials/schemas/material.schema';
import { Unit } from '../../units/schemas/unit.schema';
import { Product } from '../../products/schemas/product.schema';
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
  relatedProduct: Product; // If adjustment is from a sale

  @Prop({ type: Types.ObjectId, ref: 'Sale' })
  relatedSale: Types.ObjectId; // Direct reference to sale

  @Prop({ required: true })
  previousStock: number; // Stock level before adjustment

  @Prop({ required: true })
  newStock: number; // Stock level after adjustment

  @Prop({ default: false })
  isReversed: boolean; // If this adjustment has been reversed

  @Prop({ type: Types.ObjectId, ref: 'StockAdjustment' })
  reversalAdjustment: Types.ObjectId; // Reference to the reversal adjustment

  @Prop({ type: Types.ObjectId, ref: 'StockAdjustment' })
  originalAdjustment: Types.ObjectId; // If this is a reversal, reference to original
}

export const StockAdjustmentSchema =
  SchemaFactory.createForClass(StockAdjustment);
