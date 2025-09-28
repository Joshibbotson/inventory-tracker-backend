import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { Sale } from './schemas/sale.schema';
import { SalesService } from './sale.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  async getSales(): Promise<Sale[]> {
    return await this.salesService.getAll();
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
      soldBy?: string;
    },
  ): Promise<Sale> {
    return await this.salesService.create(body);
  }

  @Post('batch')
  async createBatchSale(
    @Body('sales')
    sales: Array<{
      product: string;
      quantity: number;
      totalPrice: number;
      soldBy?: string;
    }>,
  ): Promise<Sale[]> {
    return await this.salesService.createBatch(sales);
  }

  // @Get('range')
  // async getSalesByDateRange(
  //   @Query('startDate') startDate: string,
  //   @Query('endDate') endDate: string,
  // ): Promise<Sale[]> {
  //   return await this.salesService.findByDateRange(
  //     new Date(startDate),
  //     new Date(endDate),
  //   );
  // }

  // @Get('today')
  // async getTodaysSales(): Promise<Sale[]> {
  //   return await this.salesService.findTodaysSales();
  // }

  // @Get('summary')
  // async getSummary() {
  //   return await this.salesService.getSummary();
  // }
}
