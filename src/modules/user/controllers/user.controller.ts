import { Controller, Get, Delete, UseGuards } from '@nestjs/common';
import { UserId } from 'src/core/decorators/user-id.decorator';
import { UserService } from '../services/user.service';
import { UserDocument } from '../schemas/User.schema';
import { AuthGuard } from 'src/core/guards/Auth.guard';
import { GetUser } from 'src/core/decorators/user.decorator';

@Controller('user-details')
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** gets the user from the jwt middleware */
  @Get()
  fetchCurrentUser(@GetUser() user: UserDocument) {
    return {
      name: user.name,
      email: user.email,
      pictureUrl: user.pictureUrl,
      id: user._id,
      verifiedEmail: user.verifiedEmail,
      authProvider: user.authProvider,
    };
  }

  @Delete('delete-user-account')
  async deleteUserAccount(@UserId() userId: string) {
    return this.userService.deleteUserAccount(userId);
  }
}
