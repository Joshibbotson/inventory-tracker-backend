import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { UnitsService } from './units.service';
import { Unit, UnitType } from './schemas/unit.schema';

@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  // Get all units
  @Get()
  async findAll(): Promise<Unit[]> {
    return await this.unitsService.findAll();
  }

  // Get a single unit by id
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Unit> {
    const unit = await this.unitsService.findOne(id);
    if (!unit) {
      throw new NotFoundException(`Unit with ID "${id}" not found`);
    }
    return unit;
  }

  // Create a new unit
  @Post()
  async create(@Body() createUnitDto: Partial<Unit>): Promise<Unit> {
    try {
      return await this.unitsService.create(createUnitDto);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  // Update a unit
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateUnitDto: Partial<Unit>,
  ): Promise<Unit> {
    const updated = await this.unitsService.update(id, updateUnitDto);
    if (!updated) {
      throw new NotFoundException(`Unit with ID "${id}" not found`);
    }
    return updated;
  }

  // Delete a unit
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    const deleted = await this.unitsService.remove(id);
    if (!deleted) {
      throw new NotFoundException(`Unit with ID "${id}" not found`);
    }
  }

  // Get units by type
  @Get('type/:type')
  async findByType(@Param('type') type: UnitType): Promise<Unit[]> {
    if (!Object.values(UnitType).includes(type)) {
      throw new BadRequestException(`Invalid unit type: ${type}`);
    }
    return await this.unitsService.findByType(type);
  }

  // Seed default units
  @Post('seed')
  async seed(): Promise<Unit[]> {
    return await this.unitsService.seedDefaults();
  }
}
