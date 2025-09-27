import { Controller } from '@nestjs/common';
import { StockAdjustmentsService } from './stock-adjustments.service';

@Controller('stock-adjustments')
export class StockAdjustmentsController {
  constructor(private readonly stockAdjustmentsService: StockAdjustmentsService) {}
}
