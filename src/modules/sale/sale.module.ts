import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sale, SaleSchema } from './schemas/sale.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { StockAdjustmentsModule } from '../stock-adjustments/stock-adjustments.module';
import { ProductsModule } from '../products/products.module';
import { SalesController } from './sale.controller';
import { SalesService } from './sale.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    StockAdjustmentsModule,
    forwardRef(() => ProductsModule),
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SaleModule {}
