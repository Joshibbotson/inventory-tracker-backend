import { Module } from '@nestjs/common';
import { MaterialOrderController } from './controllers/material-order.controller';
import { MaterialOrderService } from './services/material-order.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MaterialOrder,
  MaterialOrderSchema,
} from './schemas/material-order.schema';
import { Material, MaterialSchema } from '../materials/schemas/material.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MaterialOrder.name, schema: MaterialOrderSchema },
      { name: Material.name, schema: MaterialSchema },
    ]),
  ],
  controllers: [MaterialOrderController],
  providers: [MaterialOrderService],
})
export class MaterialOrderModule {}
