import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { ProductsModule } from './modules/products/products.module';
import { StockAdjustmentsModule } from './modules/stock-adjustments/stock-adjustments.module';
import { UnitsModule } from './modules/units/units.module';
import { JwtAuthMiddleware } from './core/middleware/jwt-auth.middleware';
import { ProductionModule } from './modules/production/production.module';
import { MaterialOrderModule } from './modules/material-order/material-order.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI ?? ''),
    AuthModule,
    UserModule,
    InventoryModule,
    MaterialsModule,
    MaterialOrderModule,
    ProductsModule,
    StockAdjustmentsModule,
    UnitsModule,
    ProductionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JwtAuthMiddleware)
      .exclude(
        // Local auth routes
        { path: 'auth/local/login', method: RequestMethod.ALL },
        { path: 'auth/register', method: RequestMethod.ALL },

        // Email verification routes (no auth needed)
        { path: 'auth/verify-email', method: RequestMethod.ALL },
        { path: 'auth/resend-verification', method: RequestMethod.ALL },

        // Password reset routes (no auth needed)
        { path: 'auth/reset-password', method: RequestMethod.ALL },
        { path: 'auth/confirm-password-reset', method: RequestMethod.ALL },
        { path: 'auth/validate-reset-token', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
