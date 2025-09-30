import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductionBatchDocument = HydratedDocument<ProductionBatch>;

@Schema({ timestamps: true })
export class ProductionBatch {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  product: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true })
  batchNumber: string;

  @Prop({
    type: [
      {
        material: { type: Types.ObjectId, ref: 'Material' },
        quantity: Number,
        unitCostAtTime: Number,
        totalCost: Number,
      },
    ],
  })
  materialCosts: Array<{
    material: Types.ObjectId;
    quantity: number;
    unitCostAtTime: number;
    totalCost: number;
  }>;

  @Prop({ required: true, min: 0 })
  unitCost: number;

  @Prop({ required: true, min: 0 })
  totalCost: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  producedBy: Types.ObjectId;

  @Prop()
  notes: string;

  // Reversal fields

  @Prop({ default: 0 })
  reversedQuantity: number;

  @Prop({ default: false })
  isReversed: boolean;

  @Prop()
  reversalReason: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reversedBy: Types.ObjectId;

  @Prop()
  reversedAt: Date;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'StockAdjustment' }] })
  reversalAdjustments: Types.ObjectId[];
}

export const ProductionBatchSchema =
  SchemaFactory.createForClass(ProductionBatch);
