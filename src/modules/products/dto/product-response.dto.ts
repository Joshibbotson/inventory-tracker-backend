export class ProductCostResponseDto {
  cost: number;
  margin: number;
  marginPercentage: number;
}

export class MaterialAvailabilityResponseDto {
  available: boolean;
  missingMaterials?: Array<{
    material: string;
    materialName: string;
    required: number;
    available: number;
    shortage: number;
  }>;
}
