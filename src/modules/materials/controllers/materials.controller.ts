import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { MaterialsService } from '../services/materials.service';
import { Material, MaterialCategory } from '../schemas/material.schema';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PaginatedResponse } from 'src/core/types/PaginatedResponse';
import { StockLevel } from '../enums/StockLevel.enum';
import { RequireVerified } from 'src/core/decorators/require-verified.decorator';
import { CreateMaterial } from '../types/CreateMaterial';

export type MatertialStatistics = {
  totalMaterials: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  categoryCounts: { [key: string]: number };
};

@RequireVerified()
@Controller('materials')
export class MaterialsController {
  CACHE_KEY = 'materials';
  constructor(
    private readonly materialsService: MaterialsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @Post('find-all')
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Body()
    body?: {
      searchTerm?: string;
      category?: MaterialCategory;
      stockLevel?: StockLevel;
    },
  ): Promise<PaginatedResponse<Material>> {
    const newMaterials = await this.materialsService.findAll(
      page,
      pageSize,
      body,
    );
    return newMaterials;
  }

  @Get('statistics')
  async getStatistics(): Promise<MatertialStatistics> {
    const newStatistics = await this.materialsService.getStatistics();
    return newStatistics;
  }

  @Get('total-counts')
  async getCounts(): Promise<{
    outOfStock: number;
    lowStock: number;
    totalMaterials: number;
  }> {
    return await this.materialsService.getCounts();
  }

  @Get('search')
  async search(
    @Query('q') query: string,
    @Query('isActive') isActive?: boolean,
  ): Promise<Material[]> {
    return this.materialsService.search(query, isActive);
  }

  @Post()
  async create(
    @Body()
    createMaterialDto: CreateMaterial,
  ): Promise<Material> {
    return this.materialsService.create(createMaterialDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Material> {
    const material = await this.materialsService.findOne(id);
    if (!material) {
      throw new NotFoundException(`Material with ID "${id}" not found`);
    }
    return material;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateMaterialDto: Partial<Omit<Material, 'currentStock'>>,
  ): Promise<Material> {
    const updated = await this.materialsService.update(id, updateMaterialDto);
    if (!updated) {
      throw new NotFoundException(`Material with ID "${id}" not found`);
    }
    return updated;
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    const deleted = await this.materialsService.remove(id);
    if (!deleted) {
      throw new NotFoundException(`Material with ID "${id}" not found`);
    }
  }

  @Get('category/:category')
  async findByCategory(
    @Param('category') category: MaterialCategory,
  ): Promise<Material[]> {
    if (!Object.values(MaterialCategory).includes(category)) {
      throw new BadRequestException(`Invalid material category: ${category}`);
    }
    return this.materialsService.findByCategory(category);
  }

  @Get('low-stock')
  async findLowStock(): Promise<Material[]> {
    return this.materialsService.findLowStock();
  }

  @Get('out-of-stock')
  async findOutOfStock(): Promise<Material[]> {
    return this.materialsService.findOutOfStock();
  }

  @Get(':id/adjustments')
  async getAdjustmentHistory(@Param('id') id: string) {
    return this.materialsService.getAdjustmentHistory(id);
  }
}
