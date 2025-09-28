import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sale, SaleSchema } from './schemas/sale.schema';
import { SalesController } from './sale.controller';
import { SalesService } from './sale.service';
import { StockAdjustmentsModule } from '../stock-adjustments/stock-adjustments.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Sale.name, schema: SaleSchema }]),
    StockAdjustmentsModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SaleModule {}
