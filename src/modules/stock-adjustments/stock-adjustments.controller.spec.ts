import { Test, TestingModule } from '@nestjs/testing';
import { StockAdjustmentsController } from './stock-adjustments.controller';
import { StockAdjustmentsService } from './stock-adjustments.service';

describe('StockAdjustmentsController', () => {
  let controller: StockAdjustmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockAdjustmentsController],
      providers: [StockAdjustmentsService],
    }).compile();

    controller = module.get<StockAdjustmentsController>(StockAdjustmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
