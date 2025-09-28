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
} from '@nestjs/common';
import { MaterialsService } from './materials.service';
import { Material, MaterialCategory } from './schemas/material.schema';

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get()
  async findAll(): Promise<Material[]> {
    return this.materialsService.findAll();
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
    @Body() createMaterialDto: Partial<Material>,
  ): Promise<Material> {
    return this.materialsService.create(createMaterialDto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateMaterialDto: Partial<Material>,
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

  @Post(':id/adjust-stock')
  async adjustStock(
    @Param('id') id: string,
    @Body()
    adjustment: {
      quantity: number;
      type: 'increase' | 'decrease' | 'set';
      notes?: string;
    },
  ): Promise<Material> {
    return this.materialsService.adjustStock(id, adjustment);
  }

  @Post('bulk-adjust')
  async bulkAdjustStock(
    @Body()
    body: {
      adjustments: Array<{
        materialId: string;
        quantity: number;
        type: 'decrease';
      }>;
    },
  ): Promise<Material[]> {
    return this.materialsService.bulkAdjustStock(body.adjustments);
  }

  @Get(':id/adjustments')
  async getAdjustmentHistory(@Param('id') id: string) {
    return this.materialsService.getAdjustmentHistory(id);
  }

  @Post(':id/restock-minimum')
  async restockToMinimum(@Param('id') id: string): Promise<Material> {
    return this.materialsService.restockToMinimum(id);
  }

  @Get('search')
  async search(@Query('q') query: string): Promise<Material[]> {
    return this.materialsService.search(query);
  }

  @Get('statistics')
  async getStatistics(): Promise<{
    totalMaterials: number;
    totalValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    categoryCounts: { [key: string]: number };
  }> {
    return this.materialsService.getStatistics();
  }
}
