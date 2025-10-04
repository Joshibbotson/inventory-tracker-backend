import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  BadRequestException,
  NotFoundException,
  Inject,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { GetUser } from 'src/core/decorators/user.decorator';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { User } from 'src/modules/user/schemas/User.schema';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductsService } from '../services/products.service';
import { Product } from '../schemas/product.schema';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { RequireVerified } from 'src/core/decorators/require-verified.decorator';
import { PaginatedResponse } from 'src/core/types/PaginatedResponse';

@RequireVerified()
@Controller('products')
export class ProductsController {
  CACHE_KEY = 'products';
  constructor(
    private readonly productsService: ProductsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @Post('find-all')
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('query') query: string,
    @Body()
    body?: {
      searchTerm?: string;
      category?: string;
      status?: string;
    },
  ): Promise<PaginatedResponse<Product>> {
    const products = await this.productsService.findAll(page, pageSize, body);
    return products;
  }

  @Get('search')
  async search(@Query('q') query: string): Promise<Product[]> {
    return await this.productsService.search(query);
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

  @Post()
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({
        destination: './uploads/products',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, callback) => {
        // Skip validation for non-image fields (like 'product')
        if (file.fieldname !== 'image') {
          return callback(null, true);
        }

        // Only validate image files
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return callback(
            new BadRequestException('Only image files are allowed!'),
            false,
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async create(
    @Body() body: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @GetUser() user: User,
  ) {
    const imageFile = files?.find((f) => f.fieldname === 'image');
    const productFile = files?.find((f) => f.fieldname === 'product');

    let createProductDto: CreateProductDto;

    if (productFile) {
      const productJson = fs.readFileSync(productFile.path, 'utf-8');
      createProductDto = JSON.parse(productJson);
      // Clean up temp file
      fs.unlinkSync(productFile.path);
    } else {
      throw new BadRequestException('Product data is required');
    }

    return this.productsService.create(createProductDto, user, imageFile);
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

  @Put(':id')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({
        destination: (req, file, callback) => {
          // Only save images to disk, ignore other fields
          if (file.fieldname === 'image') {
            callback(null, './uploads/products');
          } else {
            // For non-image files, still provide a destination (won't be used)
            callback(null, './uploads/products');
          }
        },
        filename: (req, file, callback) => {
          if (file.fieldname === 'image') {
            const uniqueSuffix =
              Date.now() + '-' + Math.round(Math.random() * 1e9);
            const ext = extname(file.originalname);
            callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
          } else {
            // Provide a filename for non-image files (will be deleted later)
            const uniqueSuffix =
              Date.now() + '-' + Math.round(Math.random() * 1e9);
            callback(null, `${file.fieldname}-${uniqueSuffix}`);
          }
        },
      }),
      fileFilter: (req, file, callback) => {
        if (file.fieldname !== 'image') {
          return callback(null, true);
        }

        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return callback(
            new BadRequestException('Only image files are allowed!'),
            false,
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @GetUser() user: User,
  ) {
    const imageFile = files?.find((f) => f.fieldname === 'image');
    const productFile = files?.find((f) => f.fieldname === 'product');

    let updateProductDto: UpdateProductDto;

    if (productFile) {
      const productJson = fs.readFileSync(productFile.path, 'utf-8');
      updateProductDto = JSON.parse(productJson);
      // Clean up temp file
      fs.unlinkSync(productFile.path);
    } else {
      throw new BadRequestException('Product data is required');
    }

    const product = await this.productsService.update(
      id,
      updateProductDto,
      user,
      imageFile,
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
