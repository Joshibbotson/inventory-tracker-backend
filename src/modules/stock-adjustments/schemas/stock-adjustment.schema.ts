import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StockAdjustmentDocument = HydratedDocument<StockAdjustment>;

export enum AdjustmentType {
  PRODUCTION = 'production',
  CORRECTION = 'correction',
  REVERSAL = 'reversal',
  BREAKAGE = 'breakage',
  WASTE = 'waste',
}

@Schema({ timestamps: true })
export class StockAdjustment {
  @Prop({ type: Types.ObjectId, ref: 'Material' })
  material: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product' })
  product: Types.ObjectId;

  @Prop({ required: true, enum: ['material', 'product'] })
  itemType: string;

  @Prop({ required: true, enum: Object.values(AdjustmentType) })
  adjustmentType: AdjustmentType;

  @Prop({ required: true })
  quantity: number; // Positive for additions, negative for deductions

  @Prop({ type: Types.ObjectId, ref: 'Unit' })
  unit: Types.ObjectId;

  @Prop({ required: true })
  previousStock: number;

  @Prop({ required: true })
  newStock: number;

  @Prop()
  reason: string;

  @Prop()
  batchNumber: string; // For production tracking

  @Prop()
  orderNumber: string; // For purchase tracking

  @Prop({ min: 0 })
  unitCost: number; // Cost per unit at time of adjustment

  @Prop({ min: 0 })
  totalCost: number; // Total cost for this adjustment

  @Prop({ type: Types.ObjectId, ref: 'User' })
  adjustedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product' })
  relatedProduct: Types.ObjectId; // For material adjustments related to production
}

export const StockAdjustmentSchema =
  SchemaFactory.createForClass(StockAdjustment);
