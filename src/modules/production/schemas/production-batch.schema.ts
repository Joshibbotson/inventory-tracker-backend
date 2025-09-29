import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

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
  unitCost: number; // Cost per unit for this batch

  @Prop({ required: true, min: 0 })
  totalCost: number; // Total cost for this batch

  @Prop({ type: Types.ObjectId, ref: 'User' })
  producedBy: Types.ObjectId;

  @Prop()
  notes: string;
}

export const ProductionBatchSchema =
  SchemaFactory.createForClass(ProductionBatch);
