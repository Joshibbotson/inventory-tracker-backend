import { Module } from '@nestjs/common';
import { ProductionService } from './production.service';
import { ProductionController } from './production.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ProductionBatch,
  ProductionBatchSchema,
} from './schemas/production-batch.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { Material, MaterialSchema } from '../materials/schemas/material.schema';
import {
  StockAdjustment,
  StockAdjustmentSchema,
} from '../stock-adjustments/schemas/stock-adjustment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductionBatch.name, schema: ProductionBatchSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Material.name, schema: MaterialSchema },
      { name: StockAdjustment.name, schema: StockAdjustmentSchema },
    ]),
  ],
  controllers: [ProductionController],
  providers: [ProductionService],
})
export class ProductionModule {}
