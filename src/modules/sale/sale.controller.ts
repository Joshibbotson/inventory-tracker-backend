import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Sale } from './schemas/sale.schema';
import { AuthGuard } from 'src/core/guards/Auth.guard';
import { SalesService } from './sale.service';
import { GetUser } from 'src/core/decorators/user.decorator';
import { User } from '../user/schemas/User.schema';

@Controller('sales')
@UseGuards(AuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  async getSales(): Promise<Sale[]> {
    return await this.salesService.getAll();
  }

  @Get('summary')
  async getSummary() {
    return await this.salesService.getSummary();
  }

  @Get('today')
  async getTodaysSales(): Promise<Sale[]> {
    return await this.salesService.findTodaysSales();
  }

  @Get('range')
  async getSalesByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<Sale[]> {
    if (!startDate || !endDate) {
      throw new BadRequestException('Start date and end date are required');
    }

    return await this.salesService.findByDateRange(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('product/:productId')
  async getSalesByProduct(
    @Param('productId') productId: string,
  ): Promise<Sale[]> {
    return await this.salesService.getSalesByProduct(productId);
  }

  @Get('user/:userId')
  async getSalesByUser(@Param('userId') userId: string): Promise<Sale[]> {
    return await this.salesService.getSalesByUser(userId);
  }

  @Get('revenue')
  async getTotalRevenue(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<{ revenue: number }> {
    const revenue = await this.salesService.getTotalRevenue(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
    return { revenue };
  }

  @Get('report/monthly')
  async getMonthlyReport(
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    if (!year || !month) {
      throw new BadRequestException('Year and month are required');
    }

    return await this.salesService.getMonthlySalesReport(
      parseInt(year),
      parseInt(month),
    );
  }

  @Get(':id')
  async getSale(@Param('id') id: string): Promise<Sale | null> {
    return await this.salesService.getById(id);
  }

  @Post()
  async createSale(
    @Body()
    body: {
      product: string;
      quantity: number;
      totalPrice: number;
      notes?: string;
    },
    @GetUser() user: User,
  ): Promise<Sale> {
    return await this.salesService.create({
      ...body,
      soldBy: user._id,
    });
  }

  @Post('batch')
  async createBatchSale(
    @Body('sales')
    sales: Array<{
      product: string;
      quantity: number;
      totalPrice: number;
      notes?: string;
    }>,
    @GetUser() user: User,
  ): Promise<Sale[]> {
    const salesWithUser = sales.map((sale) => ({
      ...sale,
      soldBy: user._id,
    }));

    return await this.salesService.createBatch(salesWithUser);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  async voidSale(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @GetUser() user: User,
  ): Promise<Sale> {
    if (!reason) {
      throw new BadRequestException('Void reason is required');
    }

    return await this.salesService.voidSale(id, reason, user._id!);
  }
}
