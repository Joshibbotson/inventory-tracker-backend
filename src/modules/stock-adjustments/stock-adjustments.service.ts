import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Product,
  ProductDocument,
} from 'src/modules/products/schemas/product.schema';
import {
  Material,
  MaterialDocument,
} from 'src/modules/materials/schemas/material.schema';
import {
  StockAdjustment,
  StockAdjustmentDocument,
  AdjustmentType,
} from './schemas/stock-adjustment.schema';

@Injectable()
export class StockAdjustmentsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Material.name)
    private readonly materialModel: Model<MaterialDocument>,
    @InjectModel(StockAdjustment.name)
    private readonly stockAdjustmentModel: Model<StockAdjustmentDocument>,
  ) {}

  /**
   * Handles stock deduction for production batch.
   * Deducts materials based on BOM when producing finished goods.
   * Returns IDs of created stock adjustments.
   */
  async handleProductionDeduction(
    productId: string,
    quantityProduced: number,
    producedBy?: string,
    batchNumber?: string,
  ): Promise<{
    adjustmentIds: Types.ObjectId[];
    materialCosts: Array<{
      material: Types.ObjectId;
      quantity: number;
      unitCost: number;
      totalCost: number;
    }>;
    totalCost: number;
  }> {
    const product = await this.productModel
      .findById(productId)
      .populate('recipe.material recipe.unit')
      .exec();

    if (!product) throw new BadRequestException('Product not found');

    const adjustmentIds: Types.ObjectId[] = [];
    const materialCosts: Array<{
      material: Types.ObjectId;
      quantity: number;
      unitCost: number;
      totalCost: number;
    }> = [];
    let totalCost = 0;

    for (const recipeItem of product.recipe) {
      const material = await this.materialModel.findById(
        recipeItem.material._id || recipeItem.material,
      );

      if (!material) {
        throw new NotFoundException(
          `Material ${recipeItem.material.name} not found`,
        );
      }

      const requiredQty = recipeItem.quantity * quantityProduced;
      const previousStock = material.currentStock;
      const newStock = previousStock - requiredQty;

      if (newStock < 0) {
        throw new BadRequestException(
          `Insufficient stock of ${material.name}. Required: ${requiredQty}, Available: ${previousStock}`,
        );
      }

      // Calculate cost for this material
      const materialCost = requiredQty * material.averageCost;
      totalCost += materialCost;

      materialCosts.push({
        material: material._id,
        quantity: requiredQty,
        unitCost: material.averageCost,
        totalCost: materialCost,
      });

      // Update material stock
      material.currentStock = newStock;
      await material.save();

      // Create stock adjustment for production
      const adjustment = await this.stockAdjustmentModel.create({
        material: material._id,
        itemType: 'material',
        adjustmentType: AdjustmentType.PRODUCTION,
        quantity: -requiredQty, // Negative for deduction
        unit: recipeItem.unit,
        relatedProduct: product._id,
        adjustedBy: producedBy ? new Types.ObjectId(producedBy) : undefined,
        previousStock,
        newStock,
        reason: `Production of ${quantityProduced} units of ${product.name}`,
        batchNumber,
      });

      adjustmentIds.push(adjustment._id);
    }

    return { adjustmentIds, materialCosts, totalCost };
  }

  /**
   * Handles stock increase for material orders/purchases.
   * Updates rolling average cost.
   */
  async handleMaterialPurchase(
    materialId: string,
    quantity: number,
    totalCost: number,
    purchasedBy?: string,
    orderNumber?: string,
    notes?: string,
  ): Promise<StockAdjustment> {
    const material = await this.materialModel.findById(materialId);

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    const previousStock = material.currentStock;
    const newStock = previousStock + quantity;
    const unitCost = totalCost / quantity;

    // Update rolling average cost
    const oldTotalValue = previousStock * material.averageCost;
    const newTotalValue = oldTotalValue + totalCost;
    material.averageCost = newTotalValue / newStock;
    material.currentStock = newStock;
    await material.save();

    // Create adjustment record
    const adjustment = await this.stockAdjustmentModel.create({
      material: material._id,
      itemType: 'material',
      adjustmentType: AdjustmentType.PURCHASE,
      quantity: quantity, // Positive for addition
      unit: new Types.ObjectId(material.unit as unknown as string),
      adjustedBy: purchasedBy ? new Types.ObjectId(purchasedBy) : undefined,
      previousStock,
      newStock,
      unitCost,
      totalCost,
      orderNumber,
      reason: notes || `Material purchase - Order: ${orderNumber}`,
    });

    return adjustment;
  }

  /**
   * Handles finished product stock increase after production.
   */
  async handleProductionIncrease(
    productId: string,
    quantity: number,
    unitCost: number,
    producedBy?: string,
    batchNumber?: string,
  ): Promise<StockAdjustment> {
    const product = await this.productModel.findById(productId);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const previousStock = product.currentStock;
    const newStock = previousStock + quantity;
    const totalCost = unitCost * quantity;

    // Update rolling average cost for product
    const oldTotalValue = previousStock * product.averageUnitCost;
    const newTotalValue = oldTotalValue + totalCost;
    product.averageUnitCost = newTotalValue / newStock;
    product.currentStock = newStock;
    await product.save();

    // Create adjustment record
    const adjustment = await this.stockAdjustmentModel.create({
      product: product._id,
      itemType: 'product',
      adjustmentType: AdjustmentType.PRODUCTION,
      quantity: quantity, // Positive for addition
      adjustedBy: producedBy ? new Types.ObjectId(producedBy) : undefined,
      previousStock,
      newStock,
      unitCost,
      totalCost,
      batchNumber,
      reason: `Production batch ${batchNumber} - ${quantity} units produced`,
    });

    return adjustment;
  }

  /**
   * Creates a manual stock adjustment for materials or products.
   * Used for corrections, breakage, returns, etc.
   */
  async createManualAdjustment(
    itemId: string,
    itemType: 'material' | 'product',
    quantity: number,
    type: 'increase' | 'decrease' | 'correction',
    reason: string,
    adjustedBy: string,
  ): Promise<StockAdjustment> {
    let item: any;
    let newStock: number;
    let adjustmentType: AdjustmentType;

    if (itemType === 'material') {
      item = await this.materialModel.findById(itemId);
    } else {
      item = await this.productModel.findById(itemId);
    }

    if (!item) {
      throw new NotFoundException(`${itemType} not found`);
    }
    const previousStock: number = item.currentStock;

    switch (type) {
      case 'increase':
        newStock = previousStock + quantity;
        adjustmentType = AdjustmentType.CORRECTION;
        break;
      case 'decrease':
        newStock = previousStock - quantity;
        adjustmentType = AdjustmentType.BREAKAGE;
        quantity = -quantity; // Store as negative
        break;
      case 'correction':
        newStock = quantity; // Set to specific value
        quantity = quantity - previousStock; // Calculate difference
        adjustmentType = AdjustmentType.CORRECTION;
        break;
    }

    if (newStock < 0) {
      throw new BadRequestException('Stock cannot be negative');
    }

    // Update stock
    item.currentStock = newStock;
    await item.save();

    // Create adjustment record
    const adjustmentData: any = {
      itemType,
      adjustmentType,
      quantity,
      adjustedBy: new Types.ObjectId(adjustedBy),
      previousStock,
      newStock,
      reason,
    };

    if (itemType === 'material') {
      adjustmentData.material = item._id;
      adjustmentData.unit = item.unit;
    } else {
      adjustmentData.product = item._id;
    }

    const adjustment = await this.stockAdjustmentModel.create(adjustmentData);
    return adjustment;
  }

  /**
   * Gets adjustment history for a material or product.
   */
  async getAdjustmentHistory(
    itemId: string,
    itemType: 'material' | 'product',
    limit: number = 50,
  ): Promise<StockAdjustment[]> {
    const query: any = { itemType };

    if (itemType === 'material') {
      query.material = itemId;
    } else {
      query.product = itemId;
    }

    return this.stockAdjustmentModel
      .find(query)
      .populate('adjustedBy', 'firstName lastName email')
      .populate('material', 'name sku')
      .populate('product', 'name sku')
      .sort('-createdAt')
      .limit(limit)
      .exec();
  }

  /**
   * Gets all adjustments for a specific production batch.
   */
  async getProductionBatchAdjustments(
    batchNumber: string,
  ): Promise<StockAdjustment[]> {
    return this.stockAdjustmentModel
      .find({ batchNumber })
      .populate('material', 'name sku')
      .populate('product', 'name sku')
      .populate('unit', 'name abbreviation')
      .exec();
  }

  /**
   * Bulk adjust stock for multiple items (used in inventory counts).
   */
  async bulkAdjustStock(
    adjustments: Array<{
      itemId: string;
      itemType: 'material' | 'product';
      quantity: number;
      type: 'increase' | 'decrease' | 'correction';
      reason: string;
    }>,
    adjustedBy: string,
  ): Promise<StockAdjustment[]> {
    const results: StockAdjustment[] = [];

    for (const adjustment of adjustments) {
      const result = await this.createManualAdjustment(
        adjustment.itemId,
        adjustment.itemType,
        adjustment.quantity,
        adjustment.type,
        adjustment.reason,
        adjustedBy,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Gets summary statistics for stock adjustments.
   */
  async getAdjustmentSummary(
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalAdjustments: number;
    byType: Record<string, number>;
    byItemType: Record<string, number>;
    topAdjustedMaterials: Array<{
      material: any;
      adjustmentCount: number;
      netChange: number;
    }>;
    topAdjustedProducts: Array<{
      product: any;
      adjustmentCount: number;
      netChange: number;
    }>;
  }> {
    const query: any = {};

    if (startDate && endDate) {
      query.createdAt = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    // Get total count
    const totalAdjustments =
      await this.stockAdjustmentModel.countDocuments(query);

    // Get breakdown by adjustment type
    const typeBreakdown = await this.stockAdjustmentModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$adjustmentType',
          count: { $sum: 1 },
        },
      },
    ]);

    const byType = typeBreakdown.reduce(
      (acc, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Get breakdown by item type
    const itemTypeBreakdown = await this.stockAdjustmentModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$itemType',
          count: { $sum: 1 },
        },
      },
    ]);

    const byItemType = itemTypeBreakdown.reduce(
      (acc, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Get top adjusted materials
    const topMaterials = await this.stockAdjustmentModel.aggregate([
      { $match: { ...query, itemType: 'material' } },
      {
        $group: {
          _id: '$material',
          adjustmentCount: { $sum: 1 },
          netChange: { $sum: '$quantity' },
        },
      },
      { $sort: { adjustmentCount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'materials',
          localField: '_id',
          foreignField: '_id',
          as: 'material',
        },
      },
      { $unwind: '$material' },
      {
        $project: {
          _id: 0,
          material: {
            _id: '$material._id',
            name: '$material.name',
            sku: '$material.sku',
          },
          adjustmentCount: 1,
          netChange: 1,
        },
      },
    ]);

    // Get top adjusted products
    const topProducts = await this.stockAdjustmentModel.aggregate([
      { $match: { ...query, itemType: 'product' } },
      {
        $group: {
          _id: '$product',
          adjustmentCount: { $sum: 1 },
          netChange: { $sum: '$quantity' },
        },
      },
      { $sort: { adjustmentCount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 0,
          product: {
            _id: '$product._id',
            name: '$product.name',
            sku: '$product.sku',
          },
          adjustmentCount: 1,
          netChange: 1,
        },
      },
    ]);

    return {
      totalAdjustments,
      byType,
      byItemType,
      topAdjustedMaterials: topMaterials,
      topAdjustedProducts: topProducts,
    };
  }
}
