import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RecipeItem, RecipeItemSchema } from './recipe-item.schema';

export type ProductDocument = HydratedDocument<Product>;

export enum ProductStatus {
  ACTIVE = 'active',
  SEASONAL = 'seasonal',
  DISCONTINUED = 'discontinued',
}

export enum ProductCategory {
  SEASONAL = 'seasonal',
  REGULAR = 'regular',
  LIMITED_EDITION = 'limited_edition',
  CUSTOM = 'custom',
}

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  sku: string;

  @Prop()
  description: string;

  @Prop({ required: true, min: 0 })
  sellingPrice: number;

  @Prop({ required: true, enum: ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus;

  @Prop({
    required: true,
    enum: ProductCategory,
    default: ProductCategory.REGULAR,
  })
  category: ProductCategory;

  @Prop({ type: [RecipeItemSchema], required: true })
  recipe: RecipeItem[];

  @Prop({ default: 0, min: 0 })
  averageUnitCost: number; // Rolling average cost of finished goods

  @Prop()
  imageUrl: string;

  @Prop({ default: 0, min: 0 })
  currentStock: number; // For tracking finished products if needed

  @Prop()
  notes: string;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Add indexes for common queries
ProductSchema.index({ status: 1, category: 1 });
ProductSchema.index({ sku: 'text', name: 'text' });

// Virtual for calculating material cost
ProductSchema.virtual('materialCost').get(function () {
  if (!this.populated('recipe.material')) {
    return null;
  }

  return this.recipe.reduce((total, item) => {
    const material = item.material as any;
    return total + material.costPerUnit * item.quantity;
  }, 0);
});
