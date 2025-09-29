import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MaterialOrderDocument = HydratedDocument<MaterialOrder>;

@Schema({ timestamps: true })
export class MaterialOrder {
  createdAt: Date;

  updatedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'Material', required: true })
  material: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  totalCost: number;

  @Prop({ required: true, min: 0 })
  unitCost: number; // Cost per unit at time of order

  @Prop()
  supplier: string;

  @Prop()
  notes: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const MaterialOrderSchema = SchemaFactory.createForClass(MaterialOrder);
