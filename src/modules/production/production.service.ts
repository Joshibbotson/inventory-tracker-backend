import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Material,
  MaterialDocument,
} from '../materials/schemas/material.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { ProductionBatch } from './schemas/production-batch.schema';

@Injectable()
export class ProductionService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
    @InjectModel(ProductionBatch.name)
    private batchModel: Model<ProductionBatch>,
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
      product: productId,
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
}
