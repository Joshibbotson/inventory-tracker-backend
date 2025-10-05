import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, FilterQuery, Model, Types } from 'mongoose';
import {
  Material,
  MaterialDocument,
} from '../../materials/schemas/material.schema';
import {
  Product,
  ProductDocument,
} from '../../products/schemas/product.schema';
import { ProductionBatch } from '../schemas/production-batch.schema';
import {
  AdjustmentType,
  StockAdjustment,
} from '../../stock-adjustments/schemas/stock-adjustment.schema';

export interface ProductionStats {
  totalBatches: number;
  totalProductsProduced: number;
  totalProductionCost: number;
  averageBatchSize: number;
}

export interface FullProductionStats extends ProductionStats {
  timeline: { date: string; totalQuantity: number; batchCount: number }[];
  productTotals: {
    productName: string;
    totalQuantity: number;
    batchCount: number;
  }[];
}

@Injectable()
export class ProductionService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
    @InjectModel(ProductionBatch.name)
    private batchModel: Model<ProductionBatch>,
    @InjectModel(StockAdjustment.name)
    private stockAdjustmentModel: Model<StockAdjustment>,
  ) {}

  async createProductionBatch(
    productId: string,
    quantity: number,
    notes: string,
    userId: string,
  ): Promise<ProductionBatch> {
    // Get product with recipe
    const product = await this.productModel
      .findById(productId)
      .populate('recipe.material recipe.unit');

    if (!product) {
      throw new BadRequestException('Product not found');
    }

    // Check material availability
    const materialCosts: {
      material: Types.ObjectId;
      quantity: number;
      unitCostAtTime: number;
      totalCost: number;
    }[] = [];
    let totalBatchCost = 0;

    for (const item of product.recipe) {
      const material = await this.materialModel.findById(item.material);

      if (!material) throw new BadRequestException('material does not exist');
      const requiredQty = item.quantity * quantity;

      if (material.currentStock < requiredQty) {
        throw new BadRequestException(
          `Insufficient ${material.name}. Need ${requiredQty}, have ${material.currentStock}`,
        );
      }

      // Calculate cost for this material
      const materialCost = {
        material: material._id,
        quantity: requiredQty,
        unitCostAtTime: material.averageCost,
        totalCost: requiredQty * material.averageCost,
      };

      materialCosts.push(materialCost);
      totalBatchCost += materialCost.totalCost;

      // Deduct from material stock
      material.currentStock -= requiredQty;
      await material.save();
    }

    // Calculate unit cost for this batch
    const unitCost = totalBatchCost / quantity;

    // Update product's average unit cost (rolling average)
    const oldTotalValue = product.currentStock * product.averageUnitCost;
    const newTotalValue = oldTotalValue + totalBatchCost;
    const newTotalQuantity = product.currentStock + quantity;
    product.averageUnitCost = newTotalValue / newTotalQuantity;
    product.currentStock = newTotalQuantity;
    await product.save();

    // Create production batch record
    const batch = new this.batchModel({
      quantity,
      materialCosts,
      unitCost,
      notes,
      product: new Types.ObjectId(productId),
      batchNumber: `BATCH-${Date.now()}`,
      totalCost: totalBatchCost,
      producedBy: userId,
    });

    return batch.save();
  }

  async getProductionHistory(
    page = 1,
    pageSize = 10,
    filters?: {
      searchTerm?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<{
    data: ProductionBatch[];
    page: number;
    pageSize: number;
    total: number;
    summary?: {
      activeUnits: number;
      reversedUnits: number;
      activeCost: number;
      reversedCost: number;
    };
  }> {
    const query: FilterQuery<ProductionBatch> = {};

    // Handle date filtering
    if (filters?.startDate && filters?.endDate) {
      query.createdAt = {
        $gte: filters.startDate,
        $lte: filters.endDate,
      };
    }

    // Get all matching batches with populated product
    const allBatches = await this.batchModel
      .find(query)
      .populate('product')
      .populate('materialCosts.material')
      .sort({ createdAt: -1 })
      .exec();

    // Filter by search term in memory if provided
    let filteredBatches = allBatches;
    if (filters?.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filteredBatches = allBatches.filter((batch) => {
        const product = batch.product as any;
        return (
          batch.batchNumber?.toLowerCase().includes(searchLower) ||
          product?.name?.toLowerCase().includes(searchLower) ||
          product?.sku?.toLowerCase().includes(searchLower) ||
          batch.notes?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Paginate
    const total = filteredBatches.length;
    const skip = (page - 1) * pageSize;
    const paginatedBatches = filteredBatches.slice(skip, skip + pageSize);

    // Calculate summary
    const summary = {
      activeUnits: filteredBatches.reduce((sum, b) => sum + b.quantity, 0),
      reversedUnits: filteredBatches.reduce(
        (sum, b) => sum + (b.reversedQuantity || 0),
        0,
      ),
      activeCost: filteredBatches.reduce((sum, b) => sum + b.totalCost, 0),
      reversedCost: filteredBatches.reduce(
        (sum, b) => sum + (b.reversedQuantity || 0) * b.unitCost,
        0,
      ),
    };

    return {
      data: paginatedBatches,
      page,
      pageSize,
      total,
      summary,
    };
  }

  async getProductionStatsByProduct(productId: string): Promise<{
    totalProduced: number;
    averageBatchSize: number;
    averageUnitCost: number;
    totalBatches: number;
    recentBatches: ProductionBatch[];
  }> {
    const batches = await this.batchModel.find({ product: productId });

    const totalProduced = batches.reduce((sum, b) => sum + b.quantity, 0);
    const totalBatches = batches.length;
    const averageBatchSize =
      totalBatches > 0 ? totalProduced / totalBatches : 0;
    const averageUnitCost =
      batches.reduce((sum, b) => sum + b.unitCost, 0) / totalBatches;

    const recentBatches = await this.batchModel
      .find({ product: productId })
      .sort('-createdAt')
      .limit(5)
      .populate('materialCosts.material')
      .exec();

    return {
      totalProduced,
      averageBatchSize,
      averageUnitCost,
      totalBatches,
      recentBatches,
    };
  }

  // production.service.ts (inside your ProductionService)
  async getFullProductionStats(
    period: 'week' | 'month' | 'quarter' | '6months' | 'year' = 'month',
  ) {
    // compute date range
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    if (period === 'week') startDate.setDate(endDate.getDate() - 7);
    else if (period === 'month') startDate.setDate(endDate.getDate() - 30);
    else if (period === 'quarter') startDate.setDate(endDate.getDate() - 90);
    else if (period === '6months') startDate.setMonth(endDate.getMonth() - 6);
    else if (period === 'year')
      startDate.setFullYear(endDate.getFullYear() - 1);

    // choose bucket unit
    let bucketUnit: 'day' | 'week' | 'month' = 'day';
    if (period === '6months' || period === 'year') bucketUnit = 'month';
    else if (period === 'quarter') bucketUnit = 'week';

    const timezone = 'Europe/London'; // use user's timezone

    // overall totals
    const overallAgg = await this.batchModel
      .aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: null,
            totalBatches: { $sum: 1 },
            totalProductsProduced: { $sum: '$quantity' },
            totalProductionCost: { $sum: '$totalCost' },
          },
        },
        {
          $project: {
            _id: 0,
            totalBatches: 1,
            totalProductsProduced: 1,
            totalProductionCost: 1,
            averageBatchSize: {
              $cond: [
                { $gt: ['$totalBatches', 0] },
                { $divide: ['$totalProductsProduced', '$totalBatches'] },
                0,
              ],
            },
          },
        },
      ])
      .exec();

    const overall =
      overallAgg && overallAgg.length
        ? overallAgg[0]
        : {
            totalBatches: 0,
            totalProductsProduced: 0,
            totalProductionCost: 0,
            averageBatchSize: 0,
          };

    // timeline (bucketed)
    const timeline = await this.batchModel
      .aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          // create a truncated date for the given unit
          $addFields: {
            bucketDate: {
              $dateTrunc: { date: '$createdAt', unit: bucketUnit, timezone },
            },
          },
        },
        {
          $group: {
            _id: '$bucketDate',
            totalQuantity: { $sum: '$quantity' },
            batchCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        {
          // convert _id (Date) to formatted string and drop _id
          $project: {
            _id: 0,
            date: {
              $dateToString: { format: '%Y-%m-%d', date: '$_id', timezone },
            },
            totalQuantity: 1,
            batchCount: 1,
          },
        },
      ])
      .exec();

    // top products
    const productTotals = await this.batchModel
      .aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: '$product',
            totalQuantity: { $sum: '$quantity' },
            batchCount: { $sum: 1 },
          },
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            productId: '$_id',
            productName: '$product.name',
            totalQuantity: 1,
            batchCount: 1,
          },
        },
      ])
      .exec();

    // round numbers if you like
    const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    return {
      totalBatches: overall.totalBatches,
      totalProductsProduced: round(overall.totalProductsProduced || 0),
      totalProductionCost: round(overall.totalProductionCost || 0),
      averageBatchSize: round(overall.averageBatchSize || 0),
      timeline,
      productTotals,
    };
  }

  // Aggregate across production batches:
  // - treat null reversed/wasted as 0
  // - compute netQty = quantity - (reversedQuantity + wastedQuantity)
  // - prorate reversed/wasted cost = ((reversed+wasted) / quantity) * totalCost (when quantity > 0)
  // - netCost = totalCost - proratedReversedCost
  async getProductionStats(): Promise<ProductionStats> {
    const result = await this.batchModel
      .aggregate([
        {
          $addFields: {
            reversedQty: { $ifNull: ['$reversedQuantity', 0] },
            wastedQty: { $ifNull: ['$wastedQuantity', 0] },
          },
        },
        {
          $project: {
            quantity: 1,
            totalCost: 1,
            netQty: {
              $subtract: [
                '$quantity',
                { $add: ['$reversedQty', '$wastedQty'] },
              ],
            },
            // prorated reversal/waste cost; if quantity === 0 -> 0
            netCost: {
              $cond: [
                { $gt: ['$quantity', 0] },
                {
                  $subtract: [
                    '$totalCost',
                    {
                      $multiply: [
                        {
                          $divide: [
                            { $add: ['$reversedQty', '$wastedQty'] },
                            '$quantity',
                          ],
                        },
                        '$totalCost',
                      ],
                    },
                  ],
                },
                '$totalCost',
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalBatches: { $sum: 1 },
            totalProductsProduced: {
              // ensure we don't accumulate negative netQty if reversed > quantity
              $sum: {
                $cond: [{ $gt: ['$netQty', 0] }, '$netQty', 0],
              },
            },
            totalProductionCost: { $sum: '$netCost' },
          },
        },
        {
          $project: {
            _id: 0,
            totalBatches: 1,
            totalProductsProduced: 1,
            totalProductionCost: 1,
            averageBatchSize: {
              $cond: [
                { $gt: ['$totalBatches', 0] },
                { $divide: ['$totalProductsProduced', '$totalBatches'] },
                0,
              ],
            },
          },
        },
      ])
      .exec();

    if (!result || result.length === 0) {
      return {
        totalBatches: 0,
        totalProductsProduced: 0,
        totalProductionCost: 0,
        averageBatchSize: 0,
      };
    }

    const stats = result[0];

    // Optionally round numeric values to two decimals
    const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    return {
      totalBatches: stats.totalBatches || 0,
      totalProductsProduced: round(stats.totalProductsProduced || 0),
      totalProductionCost: round(stats.totalProductionCost || 0),
      averageBatchSize: round(stats.averageBatchSize || 0),
    };
  }

  /**
   * - find the batch
   * - check the remaining quantity against the waste input quantity
   * - waste that amount from the batch
   * -  update the product's stock count
   *
   */
  async wasteProductionBatch(
    batchId: string,
    reason: string,
    quantity: number,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const batch = await this.batchModel
      .findById(batchId)
      .populate('product')
      .populate('materialCosts.material');

    if (!batch) {
      throw new NotFoundException('Production batch not found');
    }

    const alreadyWastedQty =
      (batch.reversedQuantity || 0) + (batch.wastedQuantity || 0);
    const remainingQty = batch.quantity - alreadyWastedQty;

    if (quantity > remainingQty) {
      throw new BadRequestException(
        `Cannot waste more than remaining quantity. Remaining: ${remainingQty}`,
      );
    }

    return await this.connection.transaction(async () => {
      // Get product
      const product = await this.productModel.findById(batch.product);
      if (!product) {
        throw new NotFoundException('Product not found');
      }

      // Check stock available for waste
      if (product.currentStock < quantity) {
        throw new BadRequestException(
          `Cannot waste production. Only ${product.currentStock} units available, but ${quantity} units need to be wasted.`,
        );
      }

      const previousProductStock = product.currentStock;
      const newProductStock = previousProductStock - quantity;

      const currentTotalValue = previousProductStock * product.averageUnitCost;
      const removedValue = quantity * batch.unitCost;
      const newTotalValue = Math.max(0, currentTotalValue - removedValue);

      if (newProductStock > 0) {
        product.averageUnitCost = newTotalValue / newProductStock;
      } else {
        product.averageUnitCost = 0;
      }

      product.currentStock = newProductStock;
      await product.save();

      const productAdjustment = await this.stockAdjustmentModel.create({
        product: product._id,
        itemType: 'product',
        adjustmentType: AdjustmentType.WASTE,
        quantity: -quantity,
        previousStock: previousProductStock,
        newStock: newProductStock,
        reason: `Production partial waste: ${reason}`,
        batchNumber: batch.batchNumber,
        adjustedBy: new Types.ObjectId(userId),
      });

      // Update batch waste properties
      batch.wastedQuantity = (batch.wastedQuantity || 0) + quantity;
      batch.isWasted = batch.wastedQuantity >= batch.quantity;
      batch.wasteReason = reason;
      batch.wasteBy = new Types.ObjectId(userId);
      batch.wasteAt = new Date();
      batch.wasteAdjustments = [
        ...(batch.wasteAdjustments || []),
        productAdjustment._id,
      ];

      await batch.save();

      return {
        success: true,
        message: `Successfully wasted ${quantity} of ${batch.batchNumber}. Removed ${quantity} finished products.`,
      };
    });
  }

  async reverseProductionBatch(
    batchId: string,
    reason: string,
    quantity: number,
    reversedBy: string,
  ): Promise<{ success: boolean; message: string }> {
    return await this.connection.transaction(async () => {
      const batch = await this.batchModel
        .findById(batchId)
        .populate('product')
        .populate('materialCosts.material');

      if (!batch) {
        throw new NotFoundException('Production batch not found');
      }

      // Track how much has already been reversed
      const alreadyReversedQty =
        batch.reversedQuantity || 0 + batch.wastedQuantity || 0;
      const remainingQty = batch.quantity - alreadyReversedQty;

      if (quantity > remainingQty) {
        throw new BadRequestException(
          `Cannot reverse more than remaining quantity. Remaining: ${remainingQty}`,
        );
      }

      // Get product
      const product = await this.productModel.findById(batch.product);
      if (!product) {
        throw new NotFoundException('Product not found');
      }

      // Check stock available for reversal
      if (product.currentStock < quantity) {
        throw new BadRequestException(
          `Cannot reverse production. Only ${product.currentStock} units available, but ${quantity} units need to be reversed.`,
        );
      }

      const reversalAdjustments: any[] = [];

      try {
        // 1. Restore materials proportionally
        for (const materialCost of batch.materialCosts) {
          const material = await this.materialModel.findById(
            materialCost.material,
          );
          if (!material) {
            throw new NotFoundException(
              `Material ${materialCost.material._id.toString()} not found`,
            );
          }

          // Scale by ratio of partial reversal
          const ratio = quantity / batch.quantity;
          const restoreQty = materialCost.quantity * ratio;

          const previousStock = material.currentStock;
          const newStock = previousStock + restoreQty;

          material.currentStock = newStock;

          // Update average cost (approximate)
          const currentTotalValue = previousStock * material.averageCost;
          const restoredValue = restoreQty * materialCost.unitCostAtTime;
          const newTotalValue = currentTotalValue + restoredValue;
          material.averageCost = newTotalValue / newStock;

          await material.save();

          const adjustment = await this.stockAdjustmentModel.create({
            material: material._id,
            itemType: 'material',
            adjustmentType: AdjustmentType.REVERSAL,
            quantity: restoreQty,
            unit: new Types.ObjectId(material.unit as unknown as string),
            previousStock,
            newStock,
            reason: `Production partial reversal: ${reason}`,
            batchNumber: batch.batchNumber,
            adjustedBy: new Types.ObjectId(reversedBy),
          });

          reversalAdjustments.push(adjustment._id);
        }

        // 2. Remove finished goods (partial)
        const previousProductStock = product.currentStock;
        const newProductStock = previousProductStock - quantity;

        const currentTotalValue =
          previousProductStock * product.averageUnitCost;
        const removedValue = quantity * batch.unitCost;
        const newTotalValue = Math.max(0, currentTotalValue - removedValue);

        if (newProductStock > 0) {
          product.averageUnitCost = newTotalValue / newProductStock;
        } else {
          product.averageUnitCost = 0;
        }

        product.currentStock = newProductStock;
        await product.save();

        const productAdjustment = await this.stockAdjustmentModel.create({
          product: product._id,
          itemType: 'product',
          adjustmentType: AdjustmentType.REVERSAL,
          quantity: -quantity,
          previousStock: previousProductStock,
          newStock: newProductStock,
          reason: `Production partial reversal: ${reason}`,
          batchNumber: batch.batchNumber,
          adjustedBy: new Types.ObjectId(reversedBy),
        });

        reversalAdjustments.push(productAdjustment._id);

        // 3. Update batch reversal progress
        batch.reversedQuantity = alreadyReversedQty + quantity;
        if (batch.reversedQuantity >= batch.quantity) {
          batch.isReversed = true;
          batch.reversalReason = reason;
          batch.reversedBy = new Types.ObjectId(reversedBy);
          batch.reversedAt = new Date();
        }
        batch.reversalAdjustments = [
          ...(batch.reversalAdjustments || []),
          ...reversalAdjustments,
        ];
        await batch.save();

        return {
          success: true,
          message: `Successfully reversed ${quantity} of ${batch.batchNumber}. Restored materials and removed ${quantity} finished products.`,
        };
      } catch (error) {
        throw new BadRequestException(`Reversal failed: ${error.message}`);
      }
    });
  }

  /**
   * Check if a production batch can be reversed
   */
  async canReverseBatch(batchId: string): Promise<{
    canReverse: boolean;
    reason?: string;
  }> {
    const batch = await this.batchModel.findById(batchId).populate('product');

    if (!batch) {
      return { canReverse: false, reason: 'Batch not found' };
    }

    if (batch.isReversed) {
      return { canReverse: false, reason: 'Batch already reversed' };
    }

    const product = await this.productModel.findById(batch.product);
    if (!product) {
      return { canReverse: false, reason: 'Product not found' };
    }

    return { canReverse: true };
  }
}
