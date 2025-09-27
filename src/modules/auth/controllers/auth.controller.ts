import {
  Body,
  Controller,
  Post,
  Res,
  HttpStatus,
  Query,
  Get,
  HttpException,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({
    default: {
      limit: 3, // 3 attempts
      ttl: 60, // per 60 seconds
      blockDuration: 300, // Optional: block for 5 minutes
    },
  })
  @Post('local/login')
  async handleLocalLogin(
    @Body() loginDto: { email: string; password: string },
    @Res() res: Response,
  ) {
    try {
      const result = await this.authService.handleLocalLogin(
        loginDto.email,
        loginDto.password,
      );
      return res.status(HttpStatus.OK).json(result);
    } catch (err) {
      console.error('Local login error:', err);
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ message: 'Login failed', error: err.message });
    }
  }

  @Throttle({
    default: {
      limit: 3, // 3 attempts
      ttl: 60, // per 60 seconds
      blockDuration: 300, // Optional: block for 5 minutes
    },
  })
  @Post('register')
  async register(
    @Body()
    registerDto: {
      name: string;
      email: string;
      password: string;
      country: string;
    },
    @Res() res: Response,
  ) {
    try {
      const result = await this.authService.handleRegister(
        registerDto.name,
        registerDto.email,
        registerDto.password,
        registerDto.country,
      );
      return res.status(HttpStatus.CREATED).json(result);
    } catch (error) {
      return res
        .status(error.status || HttpStatus.BAD_REQUEST)
        .json({ message: error.message });
    }
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    try {
      return await this.authService.verifyEmail(token);
    } catch (error) {
      throw new HttpException(
        error.message || 'Email verification failed',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('resend-verification')
  async resendVerification(@Body('email') email: string) {
    try {
      return await this.authService.resendVerificationEmail(email);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to resend verification email',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Throttle({
    default: {
      limit: 3, // 3 attempts
      ttl: 60, // per 60 seconds
      blockDuration: 300, // Optional: block for 5 minutes
    },
  })
  @Post('reset-password')
  async resetPassword(@Body('email') email: string, @Res() res: Response) {
    try {
      console.log('Password reset requested for:', email);
      const result = await this.authService.resetPassword(email);
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      console.error('Password reset error:', error);

      // Handle specific error types
      if (error.status === HttpStatus.CONFLICT) {
        return res.status(HttpStatus.CONFLICT).json({
          success: false,
          message: error.message,
        });
      }

      // For security, always return success even if email doesn't exist
      return res.status(HttpStatus.OK).json({
        success: true,
        message:
          'If an account exists with this email, a password reset link has been sent',
      });
    }
  }

  @Post('in-app-reset-password')
  async inAppPasswordReset(
    @Body() body: { userId: string; oldPassword: string; newPassword: string },
  ) {
    return await this.authService.inAppPasswordReset(body);
  }

  @Post('confirm-password-reset')
  async confirmPasswordReset(
    @Body()
    confirmDto: {
      email: string;
      token: string;
      newPassword: string;
    },
    @Res() res: Response,
  ) {
    try {
      const result = await this.authService.confirmPasswordReset(
        confirmDto.email,
        confirmDto.token,
        confirmDto.newPassword,
      );
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      console.error('Confirm password reset error:', error);

      if (error.status === HttpStatus.UNAUTHORIZED) {
        return res.status(HttpStatus.UNAUTHORIZED).json({
          success: false,
          message: error.message || 'Invalid or expired password reset token',
        });
      }

      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Failed to reset password',
      });
    }
  }

  @Post('validate-reset-token')
  async validateResetToken(
    @Body() validateDto: { email: string; token: string },
    @Res() res: Response,
  ) {
    try {
      const result = await this.authService.validatePasswordResetToken(
        validateDto.email,
        validateDto.token,
      );
      return res.status(HttpStatus.OK).json(result);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return res.status(HttpStatus.OK).json({
        valid: false,
        message: 'Invalid or expired token',
      });
    }
  }
}
