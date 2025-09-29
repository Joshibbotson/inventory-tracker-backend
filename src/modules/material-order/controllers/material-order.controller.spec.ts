import { Test, TestingModule } from '@nestjs/testing';
import { MaterialOrderController } from './material-order.controller';
import { MaterialOrderService } from '../services/material-order.service';

describe('MaterialOrderController', () => {
  let controller: MaterialOrderController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialOrderController],
      providers: [MaterialOrderService],
    }).compile();

    controller = module.get<MaterialOrderController>(MaterialOrderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
