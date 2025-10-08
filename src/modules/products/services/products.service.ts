import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  Product,
  ProductDocument,
  ProductStatus,
} from '../schemas/product.schema';
import {
  Material,
  MaterialDocument,
} from '../../materials/schemas/material.schema';
import { User } from '../../user/schemas/User.schema';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import * as fs from 'fs';
import { PaginatedResponse } from 'src/core/types/PaginatedResponse';
import * as crypto from 'crypto';
import {
  ProductionBatch,
  ProductionBatchDocument,
} from 'src/modules/production/schemas/production-batch.schema';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(ProductionBatch.name)
    private productionBatchModel: Model<ProductionBatchDocument>,
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
  ) {}

  async findAll(
    page = 1,
    pageSize = 10,
    filters?: {
      searchTerm?: string;
      category?: string;
      status?: string;
    },
  ): Promise<PaginatedResponse<Product>> {
    const skip = (page - 1) * pageSize;

    const query: FilterQuery<Material> = {};

    if (filters?.searchTerm) {
      query.$or = [
        { name: { $regex: filters.searchTerm, $options: 'i' } },
        { sku: { $regex: filters.searchTerm, $options: 'i' } },
        { description: { $regex: filters.searchTerm, $options: 'i' } },
        { category: { $regex: filters.searchTerm, $options: 'i' } },
      ];
    }
    if (filters?.category) query.category = filters.category;
    if (filters?.status) query.status = filters.status;

    const [data, total] = await Promise.all([
      this.productModel
        .find(query)
        .populate('recipe.material')
        .populate('recipe.unit')
        .sort('-createdAt')
        .skip(skip)
        .limit(pageSize),

      this.productModel.countDocuments(query),
    ]);

    return {
      data,
      page,
      pageSize,
      total,
    };
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

  async search(query: string, isActive?: boolean): Promise<Product[]> {
    const filter: FilterQuery<MaterialDocument> = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { sku: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
      ],
    };

    if (isActive !== undefined) {
      filter.status = { $ne: ProductStatus.DISCONTINUED };
    }
    return await this.productModel
      .find(filter)
      .populate('recipe.material')
      .populate('recipe.unit');
  }

  async create(
    createProductDto: CreateProductDto,
    user: User,
    file?: Express.Multer.File,
  ): Promise<Product> {
    let imagePath: string | null = null;

    if (file) {
      // Store relative path or full URL
      imagePath = `/uploads/products/${file.filename}`;
    }

    const sku = this.createSku(createProductDto);

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
      sku,
      recipe: createProductDto.recipe?.map((recipe) => ({
        ...recipe,
        material: new Types.ObjectId(recipe.material),
        unit: new Types.ObjectId(recipe.unit),
      })),
      imageUrl: imagePath,
      createdBy: user._id,
    });

    const saved = await createdProduct.save();
    return saved.populate(['recipe.material', 'recipe.unit']);
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    user: User,
    file?: Express.Multer.File,
  ): Promise<Product | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
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
    // Handle image upload
    let imageUrl = updateProductDto.imageUrl;
    if (file) {
      imageUrl = `/uploads/products/${file.filename}`;

      // Optional: Delete old image file if it exists
      const existingProduct = await this.productModel.findById(id);
      if (existingProduct?.imageUrl) {
        const oldPath = `.${existingProduct.imageUrl}`;
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch (error) {
            console.error('Error deleting old image:', error);
          }
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
            unit: new Types.ObjectId(recipe.unit),
          })),
          ...(imageUrl && { imageUrl }),
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

    const existsInProductionBatch = await this.productionBatchModel.exists({
      product: new Types.ObjectId(id),
    });
    if (existsInProductionBatch)
      throw new BadRequestException(
        'Product already exists in a production batch so cannot be deleted. Please change its status to discontinued instead',
      );

    const deletedProduct = await this.productModel.findOneAndDelete({
      _id: id,
    });
    if (deletedProduct?.imageUrl) {
      const oldPath = `.${deletedProduct.imageUrl}`;
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }
    }

    return !!deletedProduct;
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

  private createSku(createProductDto: CreateProductDto): string {
    const CAT = createProductDto.category?.substring(0, 3).toUpperCase();
    const NAME = createProductDto.name.substring(0, 3).toUpperCase();
    const HASH = crypto
      .createHash('md5')
      .update(new Types.ObjectId().toString())
      .digest('hex')
      .substring(0, 3)
      .toUpperCase();
    return `${CAT}-${NAME}-${HASH}`;
  }
}
