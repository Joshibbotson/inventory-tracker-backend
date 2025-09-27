import { Types } from 'mongoose';
import { AuthProviders } from '../enums/AuthProviders.enum';
import { WorkoutSplit } from 'src/modules/workout/types/WorkoutSplit';
import { UserTokenUsage } from './UserTokenUsage';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Settings {}

export interface UserType {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password?: string;
  workoutSplits: WorkoutSplit[];
  currentWorkoutSplitId?: string;
  settings: Settings;
  tokenUsage: UserTokenUsage;
  totalWorkouts: number;
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
  isFirstLogin: boolean;
}
