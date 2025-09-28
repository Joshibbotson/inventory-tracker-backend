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
   * Deducts stock for all recipe items in a product when sold.
   * Returns IDs of created stock adjustments.
   */
  async handleSaleDeduction(
    productId: string,
    quantitySold: number,
    soldBy?: string,
  ): Promise<Types.ObjectId[]> {
    const product = await this.productModel
      .findById(productId)
      .populate('recipe.material recipe.unit')
      .exec();

    if (!product) throw new BadRequestException('Product not found');

    const adjustmentIds: Types.ObjectId[] = [];

    for (const recipeItem of product.recipe) {
      const material = recipeItem.material as MaterialDocument;
      const requiredQty = recipeItem.quantity * quantitySold;

      const previousStock = material.currentStock;
      const newStock = previousStock - requiredQty;

      if (newStock < 0) {
        throw new BadRequestException(
          `Insufficient stock of ${material.name}. Required: ${requiredQty}, Available: ${previousStock}`,
        );
      }

      // Update material stock
      material.currentStock = newStock;
      await material.save();

      // Create stock adjustment (unit comes from recipeItem.unit)
      const adjustment = await this.stockAdjustmentModel.create({
        material: material._id,
        adjustmentType: AdjustmentType.SALE,
        quantity: -requiredQty,
        unit: recipeItem.unit,
        relatedProduct: product._id,
        adjustedBy: soldBy ? new Types.ObjectId(soldBy) : undefined,
        previousStock,
        newStock,
        notes: `Sale deduction for ${quantitySold} units of ${product.name}`,
      });

      adjustmentIds.push(adjustment._id);
    }

    return adjustmentIds;
  }

  /**
   * Reverses stock adjustments when a sale is voided.
   * Restores the materials to their previous quantities.
   */
  async reverseSaleAdjustments(
    adjustmentIds: Types.ObjectId[],
    reason: string,
    voidedBy: string,
  ): Promise<Types.ObjectId[]> {
    const reversalIds: Types.ObjectId[] = [];

    for (const adjustmentId of adjustmentIds) {
      // Find the original adjustment
      const originalAdjustment = await this.stockAdjustmentModel
        .findById(adjustmentId)
        .populate('material unit')
        .exec();

      if (!originalAdjustment) {
        throw new NotFoundException(
          `Stock adjustment ${adjustmentId.toString()} not found`,
        );
      }

      // Get the material
      const material = await this.materialModel.findById(
        originalAdjustment.material,
      );

      if (!material) {
        throw new NotFoundException(
          `Material ${originalAdjustment.material.name} not found`,
        );
      }

      // Calculate the reversal quantity (opposite of original)
      const reversalQuantity = -originalAdjustment.quantity;
      const previousStock = material.currentStock;
      const newStock = previousStock + reversalQuantity;

      // Update material stock
      material.currentStock = newStock;
      await material.save();

      // Create reversal adjustment
      const reversalAdjustment = await this.stockAdjustmentModel.create({
        material: material._id,
        adjustmentType: AdjustmentType.RETURN,
        quantity: reversalQuantity,
        unit: originalAdjustment.unit,
        relatedProduct: originalAdjustment.relatedProduct,
        adjustedBy: new Types.ObjectId(voidedBy),
        previousStock,
        newStock,
        notes: `Void reversal: ${reason}. Original adjustment: ${adjustmentId.toString()}`,
        originalAdjustment: adjustmentId, // Reference to the original adjustment
      });

      // Mark original adjustment as reversed
      originalAdjustment.isReversed = true;
      originalAdjustment.reversalAdjustment = reversalAdjustment._id;
      await originalAdjustment.save();

      reversalIds.push(reversalAdjustment._id);
    }

    return reversalIds;
  }

  /**
   * Creates a manual stock adjustment for a material.
   */
  async createManualAdjustment(
    materialId: string,
    quantity: number,
    type: 'increase' | 'decrease' | 'set',
    adjustedBy: string,
    notes?: string,
  ): Promise<StockAdjustment> {
    const material = await this.materialModel.findById(materialId);

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    const previousStock = material.currentStock;
    let newStock: number;
    let adjustmentQuantity: number;
    let adjustmentType: AdjustmentType;

    switch (type) {
      case 'increase':
        newStock = previousStock + quantity;
        adjustmentQuantity = quantity;
        adjustmentType = AdjustmentType.PURCHASE;
        break;
      case 'decrease':
        newStock = previousStock - quantity;
        adjustmentQuantity = -quantity;
        adjustmentType = AdjustmentType.WASTE;
        break;
      case 'set':
        newStock = quantity;
        adjustmentQuantity = quantity - previousStock;
        adjustmentType = AdjustmentType.CORRECTION;
        break;
    }

    if (newStock < 0) {
      throw new BadRequestException('Stock cannot be negative');
    }

    // Update material stock
    material.currentStock = newStock;
    await material.save();

    // Create adjustment record
    const adjustment = await this.stockAdjustmentModel.create({
      material: material._id,
      adjustmentType,
      quantity: adjustmentQuantity,
      unit: material.unit,
      adjustedBy: new Types.ObjectId(adjustedBy),
      previousStock,
      newStock,
      notes: notes || `Manual ${type} adjustment`,
    });

    return adjustment;
  }

  /**
   * Gets adjustment history for a material.
   */
  async getMaterialAdjustmentHistory(
    materialId: string,
    limit: number = 50,
  ): Promise<StockAdjustment[]> {
    return this.stockAdjustmentModel
      .find({ material: materialId })
      .populate('adjustedBy', 'firstName lastName email')
      .populate('relatedProduct', 'name sku')
      .sort('-createdAt')
      .limit(limit)
      .exec();
  }

  /**
   * Gets all adjustments for a specific sale.
   */
  async getSaleAdjustments(saleId: string): Promise<StockAdjustment[]> {
    return this.stockAdjustmentModel
      .find({ relatedSale: saleId })
      .populate('material', 'name sku')
      .populate('unit', 'name abbreviation')
      .exec();
  }

  /**
   * Bulk adjust stock for multiple materials (used in inventory counts).
   */
  async bulkAdjustStock(
    adjustments: Array<{
      materialId: string;
      quantity: number;
      type: 'increase' | 'decrease' | 'set';
    }>,
    adjustedBy: string,
    notes?: string,
  ): Promise<StockAdjustment[]> {
    const results: StockAdjustment[] = [];

    for (const adjustment of adjustments) {
      const result = await this.createManualAdjustment(
        adjustment.materialId,
        adjustment.quantity,
        adjustment.type,
        adjustedBy,
        notes,
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
    topAdjustedMaterials: Array<{
      material: any;
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

    // Get breakdown by type
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

    // Get top adjusted materials
    const topMaterials = await this.stockAdjustmentModel.aggregate([
      { $match: query },
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

    return {
      totalAdjustments,
      byType,
      topAdjustedMaterials: topMaterials,
    };
  }
}
