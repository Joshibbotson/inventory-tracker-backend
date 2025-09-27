import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UnitDocument = HydratedDocument<Unit>;

export enum UnitType {
  DISCRETE = 'discrete',
  CONTINUOUS = 'continuous',
}

@Schema({ timestamps: true })
export class Unit {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  abbreviation: string;

  @Prop({ required: true, enum: UnitType })
  type: UnitType;

  @Prop({ required: true })
  plural: string;
}

export const UnitSchema = SchemaFactory.createForClass(Unit);
