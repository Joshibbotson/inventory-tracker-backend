import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsService } from './services/products.service';
import { Product, ProductSchema } from './schemas/product.schema';
import { Material, MaterialSchema } from '../materials/schemas/material.schema';
import { ProductsController } from './controllers/products.controller';
import {
  ProductionBatch,
  ProductionBatchSchema,
} from '../production/schemas/production-batch.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: ProductionBatch.name, schema: ProductionBatchSchema },
      { name: Material.name, schema: MaterialSchema },
    ]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
