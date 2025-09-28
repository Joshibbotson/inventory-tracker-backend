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
} from '@nestjs/common';
import { ProductsService } from './products.service';

import { User } from '../user/schemas/User.schema';
import { GetUser } from 'src/core/decorators/user.decorator';
import { AuthGuard } from 'src/core/guards/Auth.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@UseGuards(AuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    if (category) {
      return this.productsService.findByCategory(category);
    }
    if (status) {
      return this.productsService.findByStatus(status);
    }
    return this.productsService.findAll();
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
