import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  UseGuards,
} from '@nestjs/common';
import { MaterialOrderService } from '../services/material-order.service';
import { GetUser } from 'src/core/decorators/user.decorator';
import { User } from '../../user/schemas/User.schema';
import { CreateMaterialDto } from '../dto/CreateMaterialOrder.dto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { MaterialOrderDocument } from '../schemas/material-order.schema';
import { AuthGuard } from 'src/core/guards/Auth.guard';

@UseGuards(AuthGuard)
@Controller('material-orders')
export class MaterialOrderController {
  CACHE_KEY = `material-orders`;
  constructor(
    private readonly materialOrderService: MaterialOrderService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

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
    const KEY = `${this.CACHE_KEY}-${materialId}-${startDate}-${endDate}`;
    const orders = await this.cacheManager.get<MaterialOrderDocument[]>(KEY);
    if (orders) return orders;

    const newOrdersData = await this.materialOrderService.getOrders(
      materialId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
    await this.cacheManager.set(KEY, newOrdersData, 10000);
    return newOrdersData;
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
