import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Unit, UnitDocument, UnitType } from '../schemas/unit.schema';

@Injectable()
export class UnitsService {
  constructor(@InjectModel(Unit.name) private unitModel: Model<UnitDocument>) {}

  async findAll(): Promise<Unit[]> {
    return this.unitModel.find().exec();
  }

  async findOne(id: string): Promise<Unit | null> {
    return this.unitModel.findById(id).exec();
  }

  async create(createUnitDto: Partial<Unit>): Promise<Unit> {
    const created = new this.unitModel(createUnitDto);
    return created.save();
  }

  async update(id: string, updateUnitDto: Partial<Unit>): Promise<Unit | null> {
    return this.unitModel
      .findByIdAndUpdate(id, updateUnitDto, { new: true })
      .exec();
  }

  async remove(id: string): Promise<boolean> {
    const res = await this.unitModel.findByIdAndDelete(id).exec();
    return !!res;
  }

  async findByType(type: UnitType): Promise<Unit[]> {
    return this.unitModel.find({ type }).exec();
  }

  async seedDefaults(): Promise<Unit[]> {
    const defaults: Partial<Unit>[] = [
      {
        name: 'Piece',
        abbreviation: 'pc',
        plural: 'pieces',
        type: UnitType.DISCRETE,
      },
      {
        name: 'Gram',
        abbreviation: 'g',
        plural: 'grams',
        type: UnitType.CONTINUOUS,
      },
      {
        name: 'Kilogram',
        abbreviation: 'kg',
        plural: 'kilograms',
        type: UnitType.CONTINUOUS,
      },
      {
        name: 'Milliliter',
        abbreviation: 'ml',
        plural: 'milliliters',
        type: UnitType.CONTINUOUS,
      },
      {
        name: 'Liter',
        abbreviation: 'l',
        plural: 'liters',
        type: UnitType.CONTINUOUS,
      },
    ];

    // Insert only if they don’t already exist
    for (const unit of defaults) {
      const exists = await this.unitModel.findOne({ name: unit.name }).exec();
      if (!exists) {
        await this.unitModel.create(unit);
      }
    }

    return this.unitModel.find().exec();
  }
}
