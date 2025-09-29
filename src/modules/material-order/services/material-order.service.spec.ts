import { Test, TestingModule } from '@nestjs/testing';
import { MaterialOrderService } from './material-order.service';

describe('MaterialOrderService', () => {
  let service: MaterialOrderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MaterialOrderService],
    }).compile();

    service = module.get<MaterialOrderService>(MaterialOrderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
