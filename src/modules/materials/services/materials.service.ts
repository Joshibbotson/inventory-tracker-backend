import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  Material,
  MaterialDocument,
  MaterialCategory,
} from '../schemas/material.schema';
import { PaginatedResponse } from 'src/core/types/PaginatedResponse';
import { StockLevel } from '../enums/StockLevel.enum';
import { CreateMaterial } from '../types/CreateMaterial';
import * as crypto from 'crypto';
import {
  MaterialOrder,
  MaterialOrderDocument,
} from 'src/modules/material-order/schemas/material-order.schema';
import {
  Product,
  ProductDocument,
} from 'src/modules/products/schemas/product.schema';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
    @InjectModel(MaterialOrder.name)
    private materialOrdersModel: Model<MaterialOrderDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async findAll(
    page = 1,
    pageSize = 10,
    filters?: {
      searchTerm?: string;
      category?: MaterialCategory;
      stockLevel?: StockLevel;
    },
  ): Promise<PaginatedResponse<Material>> {
    const skip = (page - 1) * pageSize;

    const query: FilterQuery<Material> = {};

    if (filters?.searchTerm) {
      query.$or = [
        { name: { $regex: filters.searchTerm, $options: 'i' } },
        { sku: { $regex: filters.searchTerm, $options: 'i' } },
        { supplier: { $regex: filters.searchTerm, $options: 'i' } },
        { category: { $regex: filters.searchTerm, $options: 'i' } },
      ];
    }

    if (filters?.category) {
      query.category = filters.category;
    }

    if (filters?.stockLevel) {
      switch (filters.stockLevel) {
        case StockLevel.LOW_STOCK:
          query.$expr = { $lte: ['$currentStock', '$minimumStock'] };
          break;
        case StockLevel.OUT_OF_STOCK:
          query.currentStock = { $lte: 0 };
          break;
        case StockLevel.IN_STOCK:
          query.$expr = { $gt: ['$currentStock', '$minimumStock'] };
          break;
      }
    }

    const [data, total] = await Promise.all([
      this.materialModel
        .find(query)
        .populate('unit')
        .sort('name')
        .skip(skip)
        .limit(pageSize)
        .exec(),
      this.materialModel.countDocuments(query).exec(), // ✅ apply same filters
    ]);

    return {
      data,
      page,
      pageSize,
      total,
    };
  }

  async findOne(id: string): Promise<MaterialDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.materialModel.findById(id).populate('unit').exec();
  }

  async create(createMaterialDto: CreateMaterial): Promise<Material> {
    const created = new this.materialModel({
      ...createMaterialDto,
      sku: this.createSku(createMaterialDto),
      currentStock: 0, // always default to 0 starting stock
    });
    return created.save();
  }

  async update(
    id: string,
    updateMaterialDto: Partial<Material>,
  ): Promise<Material | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.materialModel
      .findByIdAndUpdate(id, updateMaterialDto, { new: true })
      .populate('unit')
      .exec();
  }

  async remove(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;

    const _id = new Types.ObjectId(id);
    const existInMaterialOrders = await this.materialOrdersModel.exists({
      material: _id,
    });

    const existsInProduct = await this.productModel.exists({
      'recipe.material': _id,
    });

    if (existInMaterialOrders || existsInProduct)
      throw new BadRequestException(
        'Material has been used in either a product or material order so cannot be deleted. If you no longer wish to use this Material please update it to no longer be active. ',
      );
    const res = await this.materialModel.findByIdAndDelete(id).exec();
    return !!res;
  }

  async findByCategory(category: MaterialCategory): Promise<Material[]> {
    return this.materialModel.find({ category }).populate('unit').exec();
  }

  async findLowStock(): Promise<Material[]> {
    return this.materialModel
      .find({ $expr: { $lt: ['$currentStock', '$minimumStock'] } })
      .populate('unit')
      .exec();
  }

  async findOutOfStock(): Promise<Material[]> {
    return this.materialModel
      .find({ currentStock: { $lte: 0 } })
      .populate('unit')
      .exec();
  }

  async search(query: string, isActive?: boolean): Promise<Material[]> {
    const filter: FilterQuery<MaterialDocument> = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { sku: { $regex: query, $options: 'i' } },
        { supplier: { $regex: query, $options: 'i' } },
      ],
    };

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }
    return this.materialModel.find(filter).populate('unit').exec();
  }

  async getStatistics(): Promise<{
    totalMaterials: number;
    totalValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    categoryCounts: { [key: string]: number };
  }> {
    const [totalMaterials, lowStockCount, outOfStockCount, allMaterials] =
      await Promise.all([
        this.materialModel.countDocuments(),
        this.materialModel.countDocuments({
          $expr: { $lt: ['$currentStock', '$minimumStock'] },
        }),
        this.materialModel.countDocuments({ currentStock: { $lte: 0 } }),
        this.materialModel.find().exec(),
      ]);

    const totalValue = allMaterials.reduce(
      (sum, mat) => sum + mat.currentStock * (mat.averageCost || 0),
      0,
    );

    const categoryCounts: { [key: string]: number } = {};
    for (const mat of allMaterials) {
      categoryCounts[mat.category] = (categoryCounts[mat.category] || 0) + 1;
    }

    return {
      totalMaterials,
      totalValue,
      lowStockCount,
      outOfStockCount,
      categoryCounts,
    };
  }

  async getCounts(): Promise<{
    outOfStock: number;
    lowStock: number;
    totalMaterials: number;
  }> {
    const outOfStockCount = this.materialModel.countDocuments({
      currentStock: { $lte: 0 },
    });
    const lowStockCount = this.materialModel.countDocuments({
      $expr: { $lt: ['$currentStock', '$minimumStock'] },
    });
    const totalMaterialsCount = this.materialModel.countDocuments();

    const [outOfStockTotal, lowStockTotal, totalMaterialsTotal] =
      await Promise.all([outOfStockCount, lowStockCount, totalMaterialsCount]);

    return {
      outOfStock: outOfStockTotal,
      lowStock: lowStockTotal,
      totalMaterials: totalMaterialsTotal,
    };
  }

  // Placeholder — you’ll likely want a separate StockAdjustment model here
  async getAdjustmentHistory(id: string) {
    return []; // implement with StockAdjustment schema
  }

  private createSku(createMaterial: CreateMaterial): string {
    const CAT = createMaterial.category?.substring(0, 3).toUpperCase();
    const NAME = createMaterial.name?.substring(0, 3).toUpperCase();
    const HASH = crypto
      .createHash('md5')
      .update(new Types.ObjectId().toString())
      .digest('hex')
      .substring(0, 3)
      .toUpperCase();
    return `${CAT}-${NAME}-${HASH}`;
  }
}
