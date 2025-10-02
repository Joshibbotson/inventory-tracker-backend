import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';

import { GetUser } from 'src/core/decorators/user.decorator';
import { AuthGuard } from 'src/core/guards/Auth.guard';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { User } from 'src/modules/user/schemas/User.schema';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductsService } from '../services/products.service';

@UseGuards(AuthGuard)
@Controller('products')
export class ProductsController {
  CACHE_KEY = 'products';
  constructor(
    private readonly productsService: ProductsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @Get()
  async findAll(
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    if (category) {
      // const KEY = `${this.CACHE_KEY}-${category}`;
      // const data = await this.cacheManager.get<Product[]>(KEY);
      // if (data) return data;
      const newData = await this.productsService.findByCategory(category);
      // await this.cacheManager.set(KEY, newData, 10000);
      return newData;
    }
    if (status) {
      // const KEY = `${this.CACHE_KEY}-${status}`;
      // const data = await this.cacheManager.get<Product[]>(KEY);
      // if (data) return data;
      const newData = this.productsService.findByStatus(status);
      // await this.cacheManager.set(KEY, newData, 10000);
      return newData;
    }

    // const KEY = `${this.CACHE_KEY}`;
    // const data = await this.cacheManager.get<Product[]>(KEY);
    // if (data) return data;
    const newData = this.productsService.findAll();
    // await this.cacheManager.set(KEY, newData, 10000);
    return newData;
  }

  @Get('active')
  async findActive() {
    return this.productsService.findActive();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const product = await this.productsService.findOne(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  @Get(':id/cost')
  async calculateCost(@Param('id') id: string) {
    return this.productsService.calculateProductCost(id);
  }

  @Post(':id/check-availability')
  async checkAvailability(
    @Param('id') id: string,
    @Body() body: { quantity: number },
  ) {
    if (!body.quantity || body.quantity <= 0) {
      throw new BadRequestException('Invalid quantity');
    }
    return this.productsService.checkMaterialAvailability(id, body.quantity);
  }

  @Post()
  async create(
    @Body() createProductDto: CreateProductDto,
    @GetUser() user: User,
  ) {
    return this.productsService.create(createProductDto, user);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @GetUser() user: User,
  ) {
    const product = await this.productsService.update(
      id,
      updateProductDto,
      user,
    );
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    const result = await this.productsService.remove(id);
    if (!result) {
      throw new NotFoundException('Product not found');
    }
  }
}
