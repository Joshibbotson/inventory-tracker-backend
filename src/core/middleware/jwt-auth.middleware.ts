import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtClaims } from 'src/modules/auth/types/JwtClaims.type';
import { UserService } from 'src/modules/user/services/user.service';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { UserDocument } from 'src/modules/user/schemas/User.schema';

export interface AuthenticatedRequest extends Request {
  user: UserDocument;
  jwt: JwtClaims;
  userId?: string;
}
@Injectable()
export class JwtAuthMiddleware implements NestMiddleware {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
  ) {}

  async use(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const jwtSecret =
      this.configService.get<string>('JWT_SECRET') || 'defaultToken';

    if (
      req.originalUrl.includes('/auth/') &&
      (req.originalUrl.includes('/login') ||
        req.originalUrl.includes('/callback') ||
        req.originalUrl.includes('/register'))
    ) {
      return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header missing');
    }

    const token = authHeader.replace(/^Bearer\s/, '');
    if (token === authHeader) {
      throw new UnauthorizedException('Invalid token format');
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as JwtClaims;

      if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        throw new UnauthorizedException('Token has expired');
      }

      const user = await this.userService.findById(decoded.userId.toString());

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      req.user = user;

      next();
    } catch (err) {
      console.log('JWT verification error:', err.message);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
