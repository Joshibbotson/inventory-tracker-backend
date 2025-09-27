import { Module } from '@nestjs/common';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { StockAdjustmentsController } from './stock-adjustments.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  StockAdjustment,
  StockAdjustmentSchema,
} from './schemas/stock-adjustment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockAdjustment.name, schema: StockAdjustmentSchema },
    ]),
  ],
  controllers: [StockAdjustmentsController],
  providers: [StockAdjustmentsService],
})
export class StockAdjustmentsModule {}
