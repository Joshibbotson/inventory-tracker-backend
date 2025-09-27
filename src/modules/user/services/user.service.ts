import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/User.schema';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,

    @InjectConnection() private readonly connection: Connection,
  ) {}

  async findById(id: string): Promise<UserDocument | null> {
    return await this.userModel.findById(id);
  }

  async deleteUserAccount(userId: string): Promise<boolean> {
    try {
      return await this.connection.transaction(async () => {
        const user = await this.userModel.deleteOne({
          _id: new Types.ObjectId(userId),
        });

        return user.deletedCount === 1;
      });
    } catch (error) {
      console.log('err:', error);
      throw new HttpException(
        'Error deleting user account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
