import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Material,
  MaterialDocument,
  MaterialCategory,
} from '../schemas/material.schema';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
  ) {}

  async findAll(): Promise<Material[]> {
    return this.materialModel.find().populate('unit').exec();
  }

  async findOne(id: string): Promise<MaterialDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.materialModel.findById(id).populate('unit').exec();
  }

  async create(createMaterialDto: Partial<Material>): Promise<Material> {
    const created = new this.materialModel({
      ...createMaterialDto,
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

  async search(query: string): Promise<Material[]> {
    return this.materialModel
      .find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { sku: { $regex: query, $options: 'i' } },
          { supplier: { $regex: query, $options: 'i' } },
        ],
      })
      .populate('unit')
      .exec();
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

  // Placeholder — you’ll likely want a separate StockAdjustment model here
  async getAdjustmentHistory(id: string) {
    return []; // implement with StockAdjustment schema
  }
}
