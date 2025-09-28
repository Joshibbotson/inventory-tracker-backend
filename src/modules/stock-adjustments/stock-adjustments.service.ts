import { Injectable, BadRequestException } from '@nestjs/common';
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
      });

      adjustmentIds.push(adjustment._id);
    }

    return adjustmentIds;
  }
}
