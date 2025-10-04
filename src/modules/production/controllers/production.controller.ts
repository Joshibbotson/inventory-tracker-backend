import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';

import { GetUser } from 'src/core/decorators/user.decorator';
import { User } from 'src/modules/user/schemas/User.schema';
import { ProductionBatch } from '../schemas/production-batch.schema';
import { ProductionService } from '../services/production.service';
import { RequireVerified } from 'src/core/decorators/require-verified.decorator';
import { PaginatedResponse } from 'src/core/types/PaginatedResponse';

@RequireVerified()
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

  @Post('history')
  async getProductionHistory(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Body()
    body?: {
      searchTerm?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<
    PaginatedResponse<ProductionBatch> & {
      summary?: {
        activeUnits: number;
        reversedUnits: number;
        activeCost: number;
        reversedCost: number;
      };
    }
  > {
    const newProductionHistory =
      await this.productionService.getProductionHistory(page, pageSize, body);

    return newProductionHistory;
  }

  @Get('stats/:productId')
  async getProductionStats(@Param('productId') productId: string) {
    return this.productionService.getProductionStats(productId);
  }

  @Get('batch/:id/can-reverse')
  async canReverseBatch(@Param('id') id: string) {
    return this.productionService.canReverseBatch(id);
  }

  @Post('batch/:id/reverse')
  @HttpCode(200)
  async reverseBatch(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Body('quantity') quantity: number,
    @GetUser() user: any,
  ) {
    if (!reason) {
      throw new BadRequestException('Reversal reason is required');
    }

    return this.productionService.reverseProductionBatch(
      id,
      reason,
      quantity,
      user._id,
    );
  }

  @Post('batch/:id/waste')
  @HttpCode(200)
  async wasteBatch(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Body('quantity') quantity: number,
    @GetUser() user: any,
  ) {
    if (!reason) {
      throw new BadRequestException('Waste reason is required');
    }

    return this.productionService.wasteProductionBatch(
      id,
      reason,
      quantity,
      user._id,
    );
  }
}
