import { JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';
import { UserDocument } from 'src/modules/user/schemas/User.schema';

export interface JwtClaims extends JwtPayload {
  userId: Types.ObjectId;
  user: UserDocument;
  email: string;
  name: string;
}
