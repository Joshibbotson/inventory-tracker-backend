import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../schemas/product.schema';
import {
  Material,
  MaterialDocument,
} from '../../materials/schemas/material.schema';
import { User } from '../../user/schemas/User.schema';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
  ) {}

  async findAll(): Promise<Product[]> {
    return this.productModel
      .find()
      .populate('recipe.material')
      .populate('recipe.unit')
      .sort('-createdAt')
      .exec();
  }

  async findOne(id: string): Promise<Product | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.productModel
      .findById(id)
      .populate('recipe.material')
      .populate('recipe.unit')
      .exec();
  }

  async findByCategory(category: string): Promise<Product[]> {
    return this.productModel
      .find({ category })
      .populate('recipe.material')
      .populate('recipe.unit')
      .sort('-createdAt')
      .exec();
  }

  async findByStatus(status: string): Promise<Product[]> {
    return this.productModel
      .find({ status })
      .populate('recipe.material')
      .populate('recipe.unit')
      .sort('-createdAt')
      .exec();
  }

  async findActive(): Promise<Product[]> {
    return this.productModel
      .find({ status: 'active' })
      .populate('recipe.material')
      .populate('recipe.unit')
      .sort('name')
      .exec();
  }

  async create(
    createProductDto: CreateProductDto,
    user: User,
  ): Promise<Product> {
    // Check if SKU already exists
    const existingProduct = await this.productModel.findOne({
      sku: createProductDto.sku,
    });
    if (existingProduct) {
      throw new BadRequestException('Product with this SKU already exists');
    }

    // Validate recipe materials and units exist
    if (createProductDto.recipe && createProductDto.recipe.length > 0) {
      for (const item of createProductDto.recipe) {
        const material = await this.materialModel.findById(item.material);
        if (!material) {
          throw new BadRequestException(`Material ${item.material} not found`);
        }
      }
    }

    const createdProduct = new this.productModel({
      ...createProductDto,
      recipe: createProductDto.recipe?.map((recipe) => ({
        ...recipe,
        material: new Types.ObjectId(recipe.material),
        unit: new Types.ObjectId(recipe.material),
      })),
      createdBy: user._id,
    });

    const saved = await createdProduct.save();
    return saved.populate(['recipe.material', 'recipe.unit']);
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    user: User,
  ): Promise<Product | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    // If updating SKU, check it doesn't already exist
    if (updateProductDto.sku) {
      const existingProduct = await this.productModel.findOne({
        sku: updateProductDto.sku,
        _id: { $ne: id },
      });
      if (existingProduct) {
        throw new BadRequestException('Product with this SKU already exists');
      }
    }

    // Validate recipe materials if updating recipe
    if (updateProductDto.recipe && updateProductDto.recipe.length > 0) {
      for (const item of updateProductDto.recipe) {
        const material = await this.materialModel.findById(item.material);
        if (!material) {
          throw new BadRequestException(`Material ${item.material} not found`);
        }
      }
    }

    const updated = await this.productModel
      .findByIdAndUpdate(
        id,
        {
          ...updateProductDto,
          recipe: updateProductDto.recipe?.map((recipe) => ({
            ...recipe,
            material: new Types.ObjectId(recipe.material),
            unit: new Types.ObjectId(recipe.material),
          })),
          updatedBy: user._id,
          updatedAt: new Date(),
        },
        { new: true },
      )
      .populate(['recipe.material', 'recipe.unit']);

    return updated;
  }

  async remove(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }

    const result = await this.productModel.deleteOne({ _id: id });
    return result.deletedCount > 0;
  }

  async calculateProductCost(
    id: string,
  ): Promise<{ cost: number; margin: number; marginPercentage: number }> {
    const product = await this.productModel
      .findById(id)
      .populate('recipe.material')
      .exec();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    let totalCost = 0;

    for (const item of product.recipe) {
      const material = item.material as any;
      if (material && material.costPerUnit) {
        totalCost += material.costPerUnit * item.quantity;
      }
    }

    const margin = product.sellingPrice - totalCost;
    const marginPercentage =
      product.sellingPrice > 0 ? (margin / product.sellingPrice) * 100 : 0;

    return {
      cost: totalCost,
      margin,
      marginPercentage,
    };
  }

  async checkMaterialAvailability(
    productId: string,
    quantity: number,
  ): Promise<{
    available: boolean;
    missingMaterials?: Array<{
      material: string;
      materialName: string;
      required: number;
      available: number;
      shortage: number;
    }>;
  }> {
    const product = await this.productModel
      .findById(productId)
      .populate('recipe.material')
      .exec();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const missingMaterials: Array<{
      material: string;
      materialName: string;
      required: number;
      available: number;
      shortage: number;
    }> = [];

    for (const item of product.recipe) {
      const material = item.material as any;
      const requiredQuantity = item.quantity * quantity;

      if (material.currentStock < requiredQuantity) {
        missingMaterials.push({
          material: material._id.toString(),
          materialName: material.name,
          required: requiredQuantity,
          available: material.currentStock,
          shortage: requiredQuantity - material.currentStock,
        });
      }
    }

    return {
      available: missingMaterials.length === 0,
      missingMaterials:
        missingMaterials.length > 0 ? missingMaterials : undefined,
    };
  }

  // Helper method to deduct materials after a sale (called from sales service)
  async deductMaterialsForSale(
    productId: string,
    quantity: number,
  ): Promise<void> {
    const product = await this.productModel
      .findById(productId)
      .populate('recipe.material')
      .exec();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // First check availability
    const availability = await this.checkMaterialAvailability(
      productId,
      quantity,
    );
    if (!availability.available) {
      throw new BadRequestException({
        message: 'Insufficient materials for sale',
        missingMaterials: availability.missingMaterials,
      });
    }

    // Deduct materials
    for (const item of product.recipe) {
      const material = item.material as any;
      const deductQuantity = item.quantity * quantity;

      await this.materialModel.findByIdAndUpdate(material._id, {
        $inc: { currentStock: -deductQuantity },
      });
    }
  }
}
