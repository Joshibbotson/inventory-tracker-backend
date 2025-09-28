import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Sale, SaleDocument } from './schemas/sale.schema';
import { StockAdjustmentsService } from '../stock-adjustments/stock-adjustments.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectModel(Sale.name)
    private readonly saleModel: Model<SaleDocument>,
    private readonly stockAdjustmentsService: StockAdjustmentsService,
  ) {}

  async getAll(): Promise<Sale[]> {
    return this.saleModel.find().populate('product soldBy').exec();
  }

  async getById(id: string): Promise<Sale> {
    const sale = await this.saleModel
      .findById(id)
      .populate('product soldBy stockAdjustments')
      .exec();
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  async create(saleDto: {
    product: string;
    quantity: number;
    totalPrice: number;
    notes?: string;
    soldBy?: string;
  }): Promise<Sale> {
    // Deduct stock for product recipe
    const adjustmentIds =
      await this.stockAdjustmentsService.handleSaleDeduction(
        saleDto.product,
        saleDto.quantity,
        saleDto.soldBy,
      );

    const sale = new this.saleModel({
      ...saleDto,
      stockAdjustments: adjustmentIds,
    });

    return sale.save();
  }

  async createBatch(
    sales: Array<{
      product: string;
      quantity: number;
      totalPrice: number;
      soldBy?: string;
    }>,
  ): Promise<Sale[]> {
    const results: Sale[] = [];

    for (const dto of sales) {
      results.push(await this.create(dto));
    }

    return results;
  }
}
