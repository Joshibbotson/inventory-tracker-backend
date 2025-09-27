import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Product } from 'src/modules/products/schemas/product.schema';
import { User } from 'src/modules/user/schemas/User.schema';

export type SaleDocument = HydratedDocument<Sale>;

@Schema({ timestamps: true })
export class Sale {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  product: Product;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  totalPrice: number;

  @Prop()
  notes: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  soldBy: User;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'StockAdjustment' }] })
  stockAdjustments: Types.ObjectId[]; // References to all material deductions
}

export const SaleSchema = SchemaFactory.createForClass(Sale);

// Index for sales reporting
SaleSchema.index({ createdAt: -1 });
SaleSchema.index({ product: 1, createdAt: -1 });
