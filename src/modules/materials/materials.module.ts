import { Module } from '@nestjs/common';
import { MaterialsService } from './services/materials.service';
import { MaterialsController } from './controllers/materials.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Material, MaterialSchema } from './schemas/material.schema';
import {
  MaterialOrder,
  MaterialOrderSchema,
} from '../material-order/schemas/material-order.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Material.name, schema: MaterialSchema },
      { name: MaterialOrder.name, schema: MaterialOrderSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [MaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}
