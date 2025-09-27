import { Test, TestingModule } from '@nestjs/testing';
import { StockAdjustmentsService } from './stock-adjustments.service';

describe('StockAdjustmentsService', () => {
  let service: StockAdjustmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StockAdjustmentsService],
    }).compile();

    service = module.get<StockAdjustmentsService>(StockAdjustmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
