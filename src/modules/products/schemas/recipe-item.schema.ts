import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Material } from 'src/modules/materials/schemas/material.schema';
import { Unit } from 'src/modules/units/schemas/unit.schema';

@Schema({ _id: false })
export class RecipeItem {
  @Prop({ type: Types.ObjectId, ref: 'Material', required: true })
  material: Material;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ type: Types.ObjectId, ref: 'Unit', required: true })
  unit: Unit;
}

export const RecipeItemSchema = SchemaFactory.createForClass(RecipeItem);
