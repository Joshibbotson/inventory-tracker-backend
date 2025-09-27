import { Module } from '@nestjs/common';
import { UserController } from './controllers/user.controller';
import { UserService } from './services/user.service';
import { User, UserSchema } from './schemas/User.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { Workout, WorkoutSchema } from '../workout/schema/Workout.schema';
import { UsageLimitService } from './services/monthly-usage/monthly-usage.service';
import {
  PersonalRecord,
  PersonalRecordSchema,
} from '../personal-records/schemas/PersonalRecord.schema';
import {
  WorkoutProcessing,
  WorkoutProcessingSchema,
} from '../workout/schema/WorkoutProcessing.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Workout.name, schema: WorkoutSchema },
      { name: PersonalRecord.name, schema: PersonalRecordSchema },
      { name: WorkoutProcessing.name, schema: WorkoutProcessingSchema },
    ]),
  ],
  controllers: [UserController],
  providers: [UserService, UsageLimitService],
  exports: [UserService, UsageLimitService],
})
export class UserModule {}
