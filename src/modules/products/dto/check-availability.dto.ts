import { IsNumber, Min } from 'class-validator';

export class CheckAvailabilityDto {
  @IsNumber()
  @Min(1)
  quantity: number;
}
