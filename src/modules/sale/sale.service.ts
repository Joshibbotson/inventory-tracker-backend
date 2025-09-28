// sales.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Sale, SaleDocument } from './schemas/sale.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { StockAdjustmentsService } from '../stock-adjustments/stock-adjustments.service';
import { ProductsService } from '../products/products.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectModel(Sale.name)
    private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly stockAdjustmentsService: StockAdjustmentsService,
    @Inject(forwardRef(() => ProductsService))
    private readonly productsService: ProductsService,
  ) {}

  async getAll(): Promise<Sale[]> {
    return this.saleModel
      .find()
      .populate('product soldBy')
      .sort('-createdAt')
      .exec();
  }

  async getById(id: string): Promise<Sale> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid sale ID');
    }

    const sale = await this.saleModel
      .findById(id)
      .populate('product soldBy stockAdjustments')
      .exec();

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return sale;
  }

  async create(saleDto: {
    product: string;
    quantity: number;
    totalPrice: number;
    notes?: string;
    soldBy?: string;
  }): Promise<Sale> {
    // Validate product exists
    const product = await this.productModel.findById(saleDto.product);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check material availability before processing
    const availability = await this.productsService.checkMaterialAvailability(
      saleDto.product,
      saleDto.quantity,
    );

    if (!availability.available) {
      throw new BadRequestException({
        message: 'Insufficient materials for sale',
        missingMaterials: availability.missingMaterials,
      });
    }

    // Deduct stock for product recipe
    const adjustmentIds =
      await this.stockAdjustmentsService.handleSaleDeduction(
        saleDto.product,
        saleDto.quantity,
        saleDto.soldBy,
      );

    // Create sale record
    const sale = new this.saleModel({
      ...saleDto,
      stockAdjustments: adjustmentIds,
    });

    const savedSale = await sale.save();
    return savedSale.populate('product soldBy');
  }

  async createBatch(
    sales: Array<{
      product: string;
      quantity: number;
      totalPrice: number;
      notes?: string;
      soldBy?: string;
    }>,
  ): Promise<Sale[]> {
    // First, check availability for all items
    const availabilityChecks = await Promise.all(
      sales.map(async (saleDto) => {
        const product = await this.productModel.findById(saleDto.product);
        if (!product) {
          throw new NotFoundException(`Product ${saleDto.product} not found`);
        }

        const availability =
          await this.productsService.checkMaterialAvailability(
            saleDto.product,
            saleDto.quantity,
          );

        return {
          ...saleDto,
          available: availability.available,
          missingMaterials: availability.missingMaterials,
        };
      }),
    );

    // Check if any items have insufficient materials
    const unavailable = availabilityChecks.filter((check) => !check.available);
    if (unavailable.length > 0) {
      throw new BadRequestException({
        message: 'Insufficient materials for batch sale',
        unavailableItems: unavailable.map((item) => ({
          product: item.product,
          missingMaterials: item.missingMaterials,
        })),
      });
    }

    // Process all sales
    const results: Sale[] = [];
    for (const saleDto of sales) {
      const sale = await this.create(saleDto);
      results.push(sale);
    }

    return results;
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<Sale[]> {
    return this.saleModel
      .find({
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      })
      .populate('product soldBy')
      .sort('-createdAt')
      .exec();
  }

  async findTodaysSales(): Promise<Sale[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.findByDateRange(today, tomorrow);
  }

  async getSummary(): Promise<{
    todaySales: number;
    todayRevenue: number;
    weekSales: number;
    weekRevenue: number;
    monthSales: number;
    monthRevenue: number;
    topProducts: Array<{
      product: any;
      quantity: number;
      revenue: number;
    }>;
  }> {
    const now = new Date();

    // Today's range
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Week's range (last 7 days)
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    // Month's range (last 30 days)
    const monthStart = new Date(now);
    monthStart.setDate(monthStart.getDate() - 30);
    monthStart.setHours(0, 0, 0, 0);

    // Get sales for different periods
    const [todaySales, weekSales, monthSales] = await Promise.all([
      this.findByDateRange(todayStart, todayEnd),
      this.findByDateRange(weekStart, now),
      this.findByDateRange(monthStart, now),
    ]);

    // Calculate revenues
    const todayRevenue = todaySales.reduce(
      (sum, sale) => sum + sale.totalPrice,
      0,
    );
    const weekRevenue = weekSales.reduce(
      (sum, sale) => sum + sale.totalPrice,
      0,
    );
    const monthRevenue = monthSales.reduce(
      (sum, sale) => sum + sale.totalPrice,
      0,
    );

    // Get top products (last 30 days)
    const topProducts = await this.getTopProducts(monthStart, now, 5);

    return {
      todaySales: todaySales.length,
      todayRevenue,
      weekSales: weekSales.length,
      weekRevenue,
      monthSales: monthSales.length,
      monthRevenue,
      topProducts,
    };
  }

  async getTopProducts(
    startDate: Date,
    endDate: Date,
    limit: number = 5,
  ): Promise<
    Array<{
      product: any;
      quantity: number;
      revenue: number;
    }>
  > {
    const aggregation = await this.saleModel.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: '$product',
          quantity: { $sum: '$quantity' },
          revenue: { $sum: '$totalPrice' },
        },
      },
      {
        $sort: { revenue: -1 },
      },
      {
        $limit: limit,
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      {
        $unwind: '$product',
      },
      {
        $project: {
          _id: 0,
          product: 1,
          quantity: 1,
          revenue: 1,
        },
      },
    ]);

    return aggregation;
  }

  // Additional utility methods

  async getSalesByProduct(productId: string): Promise<Sale[]> {
    if (!Types.ObjectId.isValid(productId)) {
      throw new BadRequestException('Invalid product ID');
    }

    return this.saleModel
      .find({ product: productId })
      .populate('soldBy')
      .sort('-createdAt')
      .exec();
  }

  async getSalesByUser(userId: string): Promise<Sale[]> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    return this.saleModel
      .find({ soldBy: userId })
      .populate('product')
      .sort('-createdAt')
      .exec();
  }

  async getTotalRevenue(startDate?: Date, endDate?: Date): Promise<number> {
    const query: any = {};

    if (startDate && endDate) {
      query.createdAt = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    const result = await this.saleModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalPrice' },
        },
      },
    ]);

    return result.length > 0 ? result[0].totalRevenue : 0;
  }

  async getMonthlySalesReport(
    year: number,
    month: number,
  ): Promise<{
    totalSales: number;
    totalRevenue: number;
    totalQuantity: number;
    dailyBreakdown: Array<{
      date: Date;
      sales: number;
      revenue: number;
      quantity: number;
    }>;
    productBreakdown: Array<{
      product: any;
      quantity: number;
      revenue: number;
    }>;
  }> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const sales = await this.findByDateRange(startDate, endDate);

    // Calculate totals
    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.totalPrice, 0);
    const totalQuantity = sales.reduce((sum, sale) => sum + sale.quantity, 0);

    // Daily breakdown
    const dailyBreakdown = await this.saleModel.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sales: { $sum: 1 },
          revenue: { $sum: '$totalPrice' },
          quantity: { $sum: '$quantity' },
        },
      },
      {
        $sort: { _id: 1 },
      },
      {
        $project: {
          _id: 0,
          date: { $dateFromString: { dateString: '$_id' } },
          sales: 1,
          revenue: 1,
          quantity: 1,
        },
      },
    ]);

    // Product breakdown
    const productBreakdown = await this.getTopProducts(startDate, endDate, 10);

    return {
      totalSales,
      totalRevenue,
      totalQuantity,
      dailyBreakdown,
      productBreakdown,
    };
  }

  // Void/cancel a sale (with stock restoration)
  async voidSale(id: string, reason: string, voidedBy: string): Promise<Sale> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid sale ID');
    }

    const sale = await this.saleModel
      .findById(id)
      .populate('stockAdjustments')
      .exec();

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    // Reverse stock adjustments
    await this.stockAdjustmentsService.reverseSaleAdjustments(
      sale.stockAdjustments as any[],
      reason,
      voidedBy,
    );

    // Mark sale as voided
    sale.status = 'voided';
    sale.voidReason = reason;
    sale.voidedBy = voidedBy;
    sale.voidedAt = new Date();

    return sale.save();
  }
}
