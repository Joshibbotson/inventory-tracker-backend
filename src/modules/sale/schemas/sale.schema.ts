import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Product } from '../../products/schemas/product.schema';
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
  stockAdjustments: Types.ObjectId[];

  @Prop({ default: 'completed', enum: ['completed', 'voided'] })
  status: string;

  @Prop()
  voidReason: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  voidedBy: string;

  @Prop()
  voidedAt: Date;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);
