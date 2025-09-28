import {
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
  IsOptional,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ProductStatus {
  ACTIVE = 'active',
  SEASONAL = 'seasonal',
  DISCONTINUED = 'discontinued',
}

export enum ProductCategory {
  REGULAR = 'regular',
  SEASONAL = 'seasonal',
  LIMITED_EDITION = 'limited_edition',
  CUSTOM = 'custom',
}

export class RecipeItemDto {
  @IsString()
  @IsNotEmpty()
  material: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  unit: string;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  sellingPrice: number;

  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus = ProductStatus.ACTIVE;

  @IsEnum(ProductCategory)
  @IsOptional()
  category?: ProductCategory = ProductCategory.REGULAR;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeItemDto)
  @IsOptional()
  recipe?: RecipeItemDto[];

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  currentStock?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
