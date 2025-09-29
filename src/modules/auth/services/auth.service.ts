import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AuthData } from '../types/AuthData.type';
import { User, UserDocument } from '../../user/schemas/User.schema';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthProviders } from 'src/modules/user/enums/AuthProviders.enum';
import { EmailService, EmailOptions } from 'src/modules/email/email.service';
import { InAppPasswordChangeOpts } from '../types/InAppPasswordChangeOpts';

@Injectable()
export class AuthService {
  private readonly verificationTokenExpiry = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private readonly passwordResetTokenExpiry = 60 * 60 * 1000; // 1 hour in milliseconds

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async handleLocalLogin(email: string, password: string) {
    const user = await this.validateLocalUser(email, password);
    const tokenData = this.generateJWT(user);
    // we need a DTO here
    return {
      user: {
        name: user.name,
        email: user.email,
        id: user.id,
        verifiedEmail: user.verifiedEmail,
        authProvider: user.authProvider,
      },
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
    };
  }

  async handleRegister(registerDto: {
    name: string;
    email: string;
    password: string;
    country: string;
    businessName?: string;
  }) {
    const user = await this.createLocalUser(registerDto);

    // Send verification email
    await this.sendVerificationEmail(user);

    const tokenData = this.generateJWT(user);

    return {
      user: {
        name: user.name,
        email: user.email,
        id: user.id,
        verifiedEmail: user.verifiedEmail,
      },
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
    };
  }

  async loginOrCreateUser(config: AuthData): Promise<UserDocument> {
    const existingUser = await this.userModel
      .findOne({ authId: config.authId })
      .exec();
    if (existingUser) {
      return existingUser;
    }

    const newUser = new this.userModel({
      ...config,
      settings: {},
      workoutSplit: [],
    });
    return newUser.save();
  }

  async validateLocalUser(
    email: string,
    password: string,
  ): Promise<UserDocument> {
    const user = await this.userModel.findOne({ email }).exec();

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password!);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  async createLocalUser(registerDto: {
    name: string;
    email: string;
    password: string;
    country: string;
    businessName?: string;
  }): Promise<UserDocument> {
    const { name, email, password, country, businessName } = registerDto;
    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await this.hashPassword(password);
    const now = new Date();

    // Generate verification token and expiry
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(
      Date.now() + this.verificationTokenExpiry,
    );

    const newUser = new this.userModel({
      name,
      email,
      country,
      businessName,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
      authProvider: AuthProviders.LOCAL,
      verifiedEmail: false,
      pictureUrl: undefined,
      verificationToken,
      verificationTokenExpiry,
    });

    return newUser.save();
  }

  generateJWT(user: UserDocument) {
    const expiresIn = 7 * 24 * 60 * 60; // 7 days in seconds
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const payload = {
      userId: user.id,
      email: user.email,
      name: user.name,
    };

    const token = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn,
    });

    return {
      token,
      expiresAt,
    };
  }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 14;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Send verification email to newly registered user
   */
  async sendVerificationEmail(user: UserDocument): Promise<void> {
    const appName = this.emailService.getAppName();

    // For Capacitor apps, we need to use a custom URL scheme or Universal Links/App Links
    // Example: gymnoteplus://verify-email?token=abc123
    const scheme = this.configService.get<string>('APP_URL') || 'gymnoteplus';
    const verificationUrl = `${scheme}://verify-email?token=${user.verificationToken}`;

    const text = `
Hello ${user.name},

Welcome to ${appName}! Please verify your email address by clicking the link below:

${verificationUrl}


This verification link will expire in 24 hours.

If you did not sign up for ${appName}, please ignore this email.

Thank you,
${appName} Team
    `;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333; line-height: 1.6;">
  <div style="text-align: center; margin-bottom: 25px;">
    <img src="https://i.imgur.com/Aobatoz.png" alt="${appName} Logo" style="max-height: 60px; width: auto;">
  </div>
  
  <div style="background-color: #f9f9f9; border-radius: 8px; padding: 25px; border-left: 4px solid #4285f4;">
    <h2 style="color: #4285f4; margin-top: 0;">Verify Your Email</h2>
    
    <p>Hello ${user.name},</p>
    
    <p>Welcome to <strong>${appName}</strong>! Please verify your email address to complete your registration.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationUrl}" style="background-color: #4285f4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Verify Email in App</a>
    </div>
        
    <p>Or copy one of these links:</p>
    <p style="background-color: #e9e9e9; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 14px; margin-bottom: 10px;">
      App link: ${verificationUrl}
    </p>
    
    <p>These links will expire in 24 hours.</p>
    
    <p>If you did not sign up for ${appName}, please ignore this email.</p>
  </div>
  
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dddddd; font-size: 12px; color: #777777; text-align: center;">
    <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
  </div>
</body>
</html>
    `;

    const emailOptions: EmailOptions = {
      to: user.email,
      subject: `Verify Your Email Address - ${appName}`,
      text,
      html,
    };

    await this.emailService.sendEmail(emailOptions);
  }

  /**
   * Verify user's email with token
   */
  async verifyEmail(
    token: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userModel
      .findOne({
        verificationToken: token,
        verificationTokenExpiry: { $gt: new Date() },
      })
      .exec();

    if (!user) {
      throw new NotFoundException('Invalid or expired verification token');
    }

    // Update user as verified
    user.verifiedEmail = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiry = undefined;
    await user.save();

    return {
      success: true,
      message: 'Email verification successful',
    };
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(
    email: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userModel.findOne({ email }).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.verifiedEmail) {
      return {
        success: false,
        message: 'Email is already verified',
      };
    }

    // Generate new verification token
    user.verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationTokenExpiry = new Date(
      Date.now() + this.verificationTokenExpiry,
    );
    await user.save();

    // Send verification email
    await this.sendVerificationEmail(user);

    return {
      success: true,
      message: 'Verification email resent',
    };
  }

  async resetPassword(
    email: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userModel.findOne({ email }).exec();

    if (!user) {
      // Don't reveal whether email exists for security
      return {
        success: true,
        message:
          'If an account exists with this email, a password reset link has been sent',
      };
    }

    // Don't allow password reset for OAuth users
    if (user.authProvider !== AuthProviders.LOCAL) {
      throw new ConflictException(
        `This account uses ${user.authProvider} authentication. Please sign in with ${user.authProvider}.`,
      );
    }

    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(
      Date.now() + this.passwordResetTokenExpiry,
    );

    // Hash the token before storing (for security)
    const hashedResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Save hashed token and expiry to user
    user.passwordResetToken = hashedResetToken;
    user.passwordResetTokenExpiry = resetTokenExpiry;
    await user.save();

    // Send reset email with unhashed token
    await this.sendPasswordResetEmail(user, resetToken);

    return {
      success: true,
      message:
        'If an account exists with this email, a password reset link has been sent',
    };
  }

  async inAppPasswordReset(
    opts: InAppPasswordChangeOpts,
  ): Promise<{ success: boolean; message: string }> {
    const { userId, newPassword, oldPassword } = opts;
    const user = await this.userModel.findOne({
      _id: new Types.ObjectId(userId),
    });

    if (!user) {
      throw new UnauthorizedException('No User exists');
    }

    if (user.authProvider !== AuthProviders.LOCAL)
      throw new BadRequestException('Cannot alter password of OAuth account.');

    const isPasswordValid = await this.verifyPassword(
      oldPassword,
      user.password!,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const hashedUpdatedPassword = await this.hashPassword(newPassword);

    user.password = hashedUpdatedPassword;
    await user.save();

    return {
      success: true,
      message: 'Password has been successfully updated',
    };
  }

  /**
   * Send password reset email
   */
  private async sendPasswordResetEmail(
    user: UserDocument,
    resetToken: string,
  ): Promise<void> {
    const appName = this.emailService.getAppName();

    // For Capacitor apps
    const scheme = this.configService.get<string>('APP_URL') || 'gymnoteplus';
    const resetUrl = `${scheme}://reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    const text = `
Hello ${user.name},

You have requested to reset your password for ${appName}.

Please click the link below to reset your password:

${resetUrl}

This password reset link will expire in 1 hour.

If you did not request a password reset, please ignore this email and your password will remain unchanged.

Thank you,
${appName} Team
  `;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333; line-height: 1.6;">
  <div style="text-align: center; margin-bottom: 25px;">
    <img src="https://i.imgur.com/Aobatoz.png" alt="${appName} Logo" style="max-height: 60px; width: auto;">
  </div>
  
  <div style="background-color: #f9f9f9; border-radius: 8px; padding: 25px; border-left: 4px solid #4285f4;">
    <h2 style="color: #4285f4; margin-top: 0;">Reset Your Password</h2>
    
    <p>Hello ${user.name},</p>
    
    <p>You have requested to reset your password for <strong>${appName}</strong>.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background-color: #4285f4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Reset Password in App</a>
    </div>
    
    <p>Or copy this link:</p>
    <p style="background-color: #e9e9e9; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 14px;">
      ${resetUrl}
    </p>
    
    <p style="color: #d9534f; font-weight: bold;">This link will expire in 1 hour.</p>
    
    <p>If you did not request a password reset, please ignore this email and your password will remain unchanged.</p>
    
    <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin-top: 20px;">
      <p style="margin: 0; font-size: 14px;"><strong>Security tip:</strong> Never share your password with anyone. ${appName} staff will never ask for your password.</p>
    </div>
  </div>
  
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dddddd; font-size: 12px; color: #777777; text-align: center;">
    <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
  </div>
</body>
</html>
  `;

    const emailOptions: EmailOptions = {
      to: user.email,
      subject: `Password Reset Request - ${appName}`,
      text,
      html,
    };

    await this.emailService.sendEmail(emailOptions);
  }

  /**
   * Verify password reset token and update password
   */
  async confirmPasswordReset(
    email: string,
    token: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    // Hash the provided token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userModel
      .findOne({
        email,
        passwordResetToken: hashedToken,
        passwordResetTokenExpiry: { $gt: new Date() },
      })
      .exec();

    if (!user) {
      throw new UnauthorizedException(
        'Invalid or expired password reset token',
      );
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(newPassword);

    // Update user password and clear reset token
    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpiry = undefined;
    await user.save();

    // Optionally send confirmation email
    await this.sendPasswordResetConfirmationEmail(user);

    return {
      success: true,
      message: 'Password has been successfully reset',
    };
  }

  /**
   * Send password reset confirmation email
   */
  private async sendPasswordResetConfirmationEmail(
    user: UserDocument,
  ): Promise<void> {
    const appName = this.emailService.getAppName();

    const text = `
Hello ${user.name},

Your password for ${appName} has been successfully reset.

If you did not make this change, please contact our support team immediately.

Thank you,
${appName} Team
  `;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Successful</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333; line-height: 1.6;">
  <div style="text-align: center; margin-bottom: 25px;">
    <img src="https://i.imgur.com/Aobatoz.png" alt="${appName} Logo" style="max-height: 60px; width: auto;">
  </div>
  
  <div style="background-color: #f9f9f9; border-radius: 8px; padding: 25px; border-left: 4px solid #28a745;">
    <h2 style="color: #28a745; margin-top: 0;">Password Reset Successful</h2>
    
    <p>Hello ${user.name},</p>
    
    <p>Your password for <strong>${appName}</strong> has been successfully reset.</p>
    
    <p>You can now log in with your new password.</p>
    
    <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 10px; margin-top: 20px;">
      <p style="margin: 0; font-size: 14px;"><strong>Important:</strong> If you did not make this change, please contact our support team immediately.</p>
    </div>
  </div>
  
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dddddd; font-size: 12px; color: #777777; text-align: center;">
    <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
  </div>
</body>
</html>
  `;

    const emailOptions: EmailOptions = {
      to: user.email,
      subject: `Password Reset Successful - ${appName}`,
      text,
      html,
    };

    await this.emailService.sendEmail(emailOptions);
  }

  /**
   * Validate password reset token without resetting password
   * Useful for checking if token is valid before showing reset form
   */
  async validatePasswordResetToken(
    email: string,
    token: string,
  ): Promise<{ valid: boolean; message: string }> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userModel
      .findOne({
        email,
        passwordResetToken: hashedToken,
        passwordResetTokenExpiry: { $gt: new Date() },
      })
      .exec();

    if (!user) {
      return {
        valid: false,
        message: 'Invalid or expired password reset token',
      };
    }

    return {
      valid: true,
      message: 'Token is valid',
    };
  }

  async verifyPassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }
}
