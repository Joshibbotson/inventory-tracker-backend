// src/material-orders/material-order.controller.ts
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
import { CreateMaterialDto } from '../dto/CreateMaterialOrder.dto';

@Controller('material-orders')
export class MaterialOrderController {
  constructor(private readonly materialOrderService: MaterialOrderService) {}

  @Post()
  async createOrder(
    @Body()
    body: CreateMaterialDto,
    @GetUser() user: User,
  ) {
    return await this.materialOrderService.createOrder(body, user._id!);
  }

  @Get()
  async getOrders(
    @Query('materialId') materialId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return await this.materialOrderService.getOrders(
      materialId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
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
