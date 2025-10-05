import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { MaterialOrderService } from '../services/material-order.service';
import { GetUser } from 'src/core/decorators/user.decorator';
import { User } from '../../user/schemas/User.schema';
import { CreateMaterialOrderDto } from '../dto/CreateMaterialOrder.dto';
import { RequireVerified } from 'src/core/decorators/require-verified.decorator';

@RequireVerified()
@Controller('material-orders')
export class MaterialOrderController {
  CACHE_KEY = `material-orders`;
  constructor(private readonly materialOrderService: MaterialOrderService) {}

  @Post()
  async createOrder(
    @Body()
    body: CreateMaterialOrderDto,
    @GetUser() user: User,
  ) {
    return await this.materialOrderService.createOrder(body, user._id!);
  }

  @Post('find-all')
  async getOrders(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Body() body: { materialId?: string; startDate?: string; endDate?: string },
  ) {
    const ordersData = await this.materialOrderService.getOrders(
      page,
      pageSize,
      body,
    );
    return ordersData;
  }

  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    return await this.materialOrderService.getOrderById(id);
  }

  @Get('stats/:materialId')
  async getStats(@Param('materialId') materialId: string) {
    return await this.materialOrderService.getOrderStats(materialId);
  }

  @Delete(':id')
  async deleteOrder(@Param('id') orderId: string) {
    return await this.materialOrderService.deleteOrder(orderId);
  }
}
