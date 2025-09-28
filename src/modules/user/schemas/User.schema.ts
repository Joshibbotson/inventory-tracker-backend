import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { AuthProviders } from '../enums/AuthProviders.enum';

export type UserDocument = User & Document;

@Schema({ timestamps: true, collection: 'user' })
export class User {
  @Prop()
  _id?: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  businessName?: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  password?: string;

  // Existing fields
  @Prop()
  surname?: string;

  @Prop()
  firstName?: string;

  @Prop()
  authId?: string;

  @Prop()
  pictureUrl?: string;

  @Prop()
  verifiedEmail?: boolean;

  @Prop()
  verificationToken?: string;

  @Prop()
  verificationTokenExpiry?: Date;

  @Prop()
  passwordResetToken?: string;

  @Prop()
  passwordResetTokenExpiry?: Date;

  @Prop({ enum: AuthProviders })
  authProvider?: AuthProviders;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 });
