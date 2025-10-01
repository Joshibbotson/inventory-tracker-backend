import { Module } from '@nestjs/common';
import { UnitsService } from './services/units.service';
import { Unit, UnitSchema } from './schemas/unit.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { UnitsController } from './controllers/units.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Unit.name, schema: UnitSchema }]),
  ],
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}
