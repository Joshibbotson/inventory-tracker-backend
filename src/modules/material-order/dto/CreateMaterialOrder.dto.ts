import { IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateMaterialDto {
  @IsString()
  material: string;

  @IsPositive()
  quantity: number;

  @IsPositive()
  totalCost: number;

  @IsOptional()
  @IsString()
  supplier?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
