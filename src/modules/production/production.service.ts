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
    reversedBy: string,
  ): Promise<{ success: boolean; message: string }> {
    // Find the production batch
    const batch = await this.batchModel
      .findById(batchId)
      .populate('product')
      .populate('materialCosts.material');

    if (!batch) {
      throw new NotFoundException('Production batch not found');
    }

    // Check if already reversed
    if (batch.isReversed) {
      throw new BadRequestException(
        'This production batch has already been reversed',
      );
    }

    // Get the product
    const product = await this.productModel.findById(batch.product);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check if product has enough stock to reverse
    if (product.currentStock < batch.quantity) {
      throw new BadRequestException(
        `Cannot reverse production. Only ${product.currentStock} units available, but ${batch.quantity} units need to be reversed. Some may have been sold or adjusted.`,
      );
    }

    // Start reversal process
    const reversalAdjustments: any[] = [];

    try {
      // 1. Restore materials to stock
      for (const materialCost of batch.materialCosts) {
        const material = await this.materialModel.findById(
          materialCost.material,
        );
        if (!material) {
          throw new NotFoundException(
            `Material ${materialCost.material._id.toString()} not found`,
          );
        }

        const previousStock = material.currentStock;
        const newStock = previousStock + materialCost.quantity;

        // Update material stock (add back what was used)
        material.currentStock = newStock;

        // Recalculate rolling average (this is an approximation)
        // In a perfect world, we'd track the exact cost history
        // For now, we'll use the cost at production time
        const currentTotalValue = previousStock * material.averageCost;
        const restoredValue =
          materialCost.quantity * materialCost.unitCostAtTime;
        const newTotalValue = currentTotalValue + restoredValue;
        material.averageCost = newTotalValue / newStock;

        await material.save();

        // Create reversal adjustment record
        const adjustment = await this.stockAdjustmentModel.create({
          material: material._id,
          itemType: 'material',
          adjustmentType: 'reversal',
          quantity: materialCost.quantity, // Positive for restoration
          unit: material.unit,
          previousStock,
          newStock,
          reason: `Production reversal: ${reason}`,
          batchNumber: batch.batchNumber,
          adjustedBy: new Types.ObjectId(reversedBy),
        });

        reversalAdjustments.push(adjustment._id);
      }

      // 2. Remove finished goods from product stock
      const previousProductStock = product.currentStock;
      const newProductStock = previousProductStock - batch.quantity;

      // Recalculate product average cost (remove this batch's contribution)
      const currentTotalValue = previousProductStock * product.averageUnitCost;
      const removedValue = batch.quantity * batch.unitCost;
      const newTotalValue = Math.max(0, currentTotalValue - removedValue);

      if (newProductStock > 0) {
        product.averageUnitCost = newTotalValue / newProductStock;
      } else {
        product.averageUnitCost = 0;
      }

      product.currentStock = newProductStock;
      await product.save();

      // Create product adjustment record
      const productAdjustment = await this.stockAdjustmentModel.create({
        product: product._id,
        itemType: 'product',
        adjustmentType: AdjustmentType.REVERSAL,
        quantity: -batch.quantity,
        previousStock: previousProductStock,
        newStock: newProductStock,
        reason: `Production reversal: ${reason}`,
        batchNumber: batch.batchNumber,
        adjustedBy: new Types.ObjectId(reversedBy),
      });

      reversalAdjustments.push(productAdjustment._id);

      // 3. Mark batch as reversed
      batch.isReversed = true;
      batch.reversalReason = reason;
      batch.reversedBy = new Types.ObjectId(reversedBy);
      batch.reversedAt = new Date();
      batch.reversalAdjustments = reversalAdjustments;
      await batch.save();

      return {
        success: true,
        message: `Successfully reversed production batch ${batch.batchNumber}. Restored ${batch.materialCosts.length} materials and removed ${batch.quantity} finished products.`,
      };
    } catch (error) {
      // If any error occurs during reversal, we should ideally roll back
      // For now, throw the error up
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

    if (product.currentStock < batch.quantity) {
      return {
        canReverse: false,
        reason: `Insufficient product stock. Need ${batch.quantity} but only ${product.currentStock} available`,
      };
    }

    return { canReverse: true };
  }
}
