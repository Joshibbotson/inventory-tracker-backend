import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Material,
  MaterialDocument,
} from '../materials/schemas/material.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { ProductionBatch } from './schemas/production-batch.schema';
import {
  AdjustmentType,
  StockAdjustment,
} from '../stock-adjustments/schemas/stock-adjustment.schema';

@Injectable()
export class ProductionService {
  constructor(
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
    productId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<ProductionBatch[]> {
    const query: any = {};

    if (productId) {
      query.product = productId;
    }

    if (startDate && endDate) {
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    query.isReversed = false;

    return this.batchModel
      .find(query)
      .populate('product')
      .populate('materialCosts.material')
      .sort('-createdAt')
      .exec();
  }

  async getProductionStats(productId: string): Promise<{
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

  async reverseProductionBatch(
    batchId: string,
    reason: string,
    quantity: number,
    reversedBy: string,
  ): Promise<{ success: boolean; message: string }> {
    const batch = await this.batchModel
      .findById(batchId)
      .populate('product')
      .populate('materialCosts.material');

    if (!batch) {
      throw new NotFoundException('Production batch not found');
    }

    // Track how much has already been reversed
    const alreadyReversedQty = batch.reversedQuantity || 0;
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
          adjustmentType: 'reversal',
          quantity: restoreQty,
          unit: material.unit,
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
