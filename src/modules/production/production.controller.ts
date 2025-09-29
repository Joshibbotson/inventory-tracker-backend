import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { ProductionService } from './production.service';
import { GetUser } from 'src/core/decorators/user.decorator';
import { User } from '../user/schemas/User.schema';

@Controller('production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Post('batch')
  async createProductionBatch(
    @Body()
    body: {
      productId: string;
      quantity: number;
      notes?: string;
    },
    @GetUser() user: User,
  ) {
    // Assuming you have userId from auth middleware/session
    return this.productionService.createProductionBatch(
      body.productId,
      body.quantity,
      body.notes || '',
      user._id!,
    );
  }

  @Get('history')
  async getProductionHistory(
    @Query('productId') productId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.productionService.getProductionHistory(
      productId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('stats/:productId')
  async getProductionStats(@Param('productId') productId: string) {
    return this.productionService.getProductionStats(productId);
  }
}
