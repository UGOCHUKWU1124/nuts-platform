import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { AdminCacheBypass } from '@api/modules/shared/decorators/admin-cache-bypass.decorator';
import { ModerateThrottle } from '@api/modules/shared/decorators/custom-throttler.decorator';
import { Message } from '@api/modules/shared/decorators/message.decorator';
import { Public } from '@api/modules/shared/decorators/public.decorator';

import {
  ApiResponseDto,
  PaginationMetaDto,
} from '@api/modules/shared/dto/api-response.dto';

import { CursorPaginationMetaDto } from '@api/modules/shared/utils/cursor-pagination.util';

import { ProductCardDto } from './dto/product-card.dto';
import { PublicProductResponseDto } from './dto/public-product-response.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { QueryProductsBodyDto } from './dto/query-products-body.dto';
import { ProductsService } from './products.service';

@ApiTags('PRODUCTS')
@ApiExtraModels(
  ApiResponseDto,
  PaginationMetaDto,
  CursorPaginationMetaDto,
  ProductCardDto,
  PublicProductResponseDto,
)
@Public()
@Controller('products')
export class ProductController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * Cursor-based public product search.
   *
   * Accepts a structured filter body and is designed for the storefront's cursor-search flow.
   */
  @ModerateThrottle()
  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List and search products with cursor pagination',
    description:
      'Returns active, non-deleted products. Pass meta.nextCursor from the previous response as cursor to retrieve the next page.',
  })
  @ApiOkResponse({
    description: 'Cursor-paginated product list.',
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(ApiResponseDto),
        },
        {
          properties: {
            data: {
              type: 'array',
              items: {
                $ref: getSchemaPath(ProductCardDto),
              },
            },
            meta: {
              $ref: getSchemaPath(CursorPaginationMetaDto),
            },
          },
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid product filters or cursor.',
  })
  async queryProducts(
    @Body() body: QueryProductsBodyDto,
    @AdminCacheBypass() bypassCache: boolean,
  ): Promise<{
    data: ProductCardDto[];
    meta: CursorPaginationMetaDto;
  }> {
    return this.productsService.findAllPublicCursor({
      ...body,
      bypassCache,
    });
  }

  /**
   * Public product catalog and filter endpoint.
   *
   * Supports both cursor-based (when cursor is provided) and page-based pagination.
   */
  @ModerateThrottle()
  @Get()
  @ApiOperation({
    summary: 'List and search products',
    description:
      'Returns active, non-deleted products using cursor or page-based pagination.',
  })
  @ApiOkResponse({
    description: 'Paginated product list.',
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(ApiResponseDto),
        },
        {
          properties: {
            data: {
              type: 'array',
              items: {
                $ref: getSchemaPath(ProductCardDto),
              },
            },
            meta: {
              $ref: getSchemaPath(PaginationMetaDto),
            },
          },
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters.',
  })
  async findAll(
    @Query() query: QueryProductDto,
    @AdminCacheBypass() bypassCache: boolean,
  ): Promise<{
    data: ProductCardDto[];
    meta: PaginationMetaDto | CursorPaginationMetaDto;
  }> {
    return this.productsService.findAllPublic({
      ...query,
      bypassCache,
    });
  }

  /**
   * Public "Going Nuts" trending products by sales volume.
   */
  @ModerateThrottle()
  @Get('going-nuts')
  @ApiOperation({
    summary: 'List top trending products by sales volume (Going Nuts)',
    description:
      'Aggregates confirmed order sales volume over the given window (default 30 days) and falls back gracefully to top-rated items.',
  })
  @ApiOkResponse({
    description: 'Trending product card list.',
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(ApiResponseDto),
        },
        {
          properties: {
            data: {
              type: 'array',
              items: {
                $ref: getSchemaPath(ProductCardDto),
              },
            },
          },
        },
      ],
    },
  })
  async getGoingNuts(
    @Query('limit') limit?: string,
    @Query('days') days?: string,
    @AdminCacheBypass() bypassCache?: boolean,
  ): Promise<ProductCardDto[]> {
    return this.productsService.findGoingNuts({
      limit: limit ? parseInt(limit, 10) : 20,
      days: days ? parseInt(days, 10) : 30,
      bypassCache,
    });
  }

  /**
   * Public product detail.
   *
   * Slug is used instead of an internal product ID so the storefront URL
   * remains stable and does not expose database identifiers.
   */
  @ModerateThrottle()
  @Get(':slug')
  @Message('Product retrieved successfully')
  @ApiOperation({
    summary: 'Get product by slug',
    description: 'Returns one active, non-deleted product.',
  })
  @ApiParam({
    name: 'slug',
    description: 'Product slug, for example nike-air-max',
    example: 'nike-air-max',
  })
  @ApiOkResponse({
    description: 'Product details.',
    schema: {
      allOf: [
        {
          $ref: getSchemaPath(ApiResponseDto),
        },
        {
          properties: {
            data: {
              $ref: getSchemaPath(PublicProductResponseDto),
            },
          },
        },
      ],
    },
  })
  @ApiNotFoundResponse({
    description: 'Product not found.',
  })
  async findBySlug(
    @Param('slug') slug: string,
    @AdminCacheBypass() bypassCache: boolean,
  ): Promise<PublicProductResponseDto> {
    return this.productsService.findOnePublic(slug, bypassCache);
  }
}
