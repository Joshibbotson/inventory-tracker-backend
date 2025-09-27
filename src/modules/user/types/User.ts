import { Types } from 'mongoose';
import { AuthProviders } from '../enums/AuthProviders.enum';

export interface UserType {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password?: string;

  surname?: string;
  firstName?: string;
  authId?: string;
  pictureUrl?: string;
  verifiedEmail?: boolean;
  verificationToken?: string;
  verificationTokenExpiry?: Date;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  authProvider?: AuthProviders;
  country: string;
  createdAt?: Date;
  updatedAt?: Date;
}
