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
  UseGuards,
} from '@nestjs/common';
import { MaterialsService } from '../services/materials.service';
import { Material, MaterialCategory } from '../schemas/material.schema';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AuthGuard } from 'src/core/guards/Auth.guard';
import { PaginatedResponse } from 'src/core/types/PaginatedResponse';

export type MatertialStatistics = {
  totalMaterials: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  categoryCounts: { [key: string]: number };
};

@UseGuards(AuthGuard)
@Controller('materials')
export class MaterialsController {
  CACHE_KEY = 'materials';
  constructor(
    private readonly materialsService: MaterialsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
  ): Promise<PaginatedResponse<Material>> {
    const KEY = `${this.CACHE_KEY}-findAll`;
    const materials =
      await this.cacheManager.get<PaginatedResponse<Material>>(KEY);
    if (materials) return materials;

    const newMaterials = await this.materialsService.findAll(page, pageSize);
    await this.cacheManager.set(KEY, newMaterials, 10000);
    return newMaterials;
  }

  @Get('statistics')
  async getStatistics(): Promise<MatertialStatistics> {
    const KEY = `${this.CACHE_KEY}-statistics`;
    const statistics = await this.cacheManager.get<MatertialStatistics>(KEY);
    if (statistics) return statistics;
    const newStatistics = await this.materialsService.getStatistics();
    await this.cacheManager.set(KEY, newStatistics, 10000);
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

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Material> {
    const material = await this.materialsService.findOne(id);
    if (!material) {
      throw new NotFoundException(`Material with ID "${id}" not found`);
    }
    return material;
  }

  @Post()
  async create(
    @Body() createMaterialDto: Partial<Omit<Material, 'currentStock'>>,
  ): Promise<Material> {
    return this.materialsService.create(createMaterialDto);
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

  @Get('search')
  async search(@Query('q') query: string): Promise<Material[]> {
    return this.materialsService.search(query);
  }
}
