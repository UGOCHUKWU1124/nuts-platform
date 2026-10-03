// public-store.controller.ts

import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { Message } from '@api/modules/shared/decorators/message.decorator';
import { Public } from '@api/modules/shared/decorators/public.decorator';
import { ApiResponseDto } from '@api/modules/shared/dto/api-response.dto';
import { VendorProfileDto } from './dto/vendor-response.dto';
import { VendorsService } from './vendors.service';

@ApiTags('VENDORS - ACCOUNT')
@Public()
@Controller('vendors/store')
export class PublicStoreController {
  constructor(private readonly vendorsService: VendorsService) {}

  /**
   * Public vendor discovery endpoint.
   *
   * Search/category filtering is delegated to the service so the database
   * can perform the filtering instead of loading large intermediate ID lists
   * into Node.js.
   */
  @Get()
  @Message('All vendors retrieved successfully')
  @ApiOperation({
    summary: 'Get all public vendors',
    description:
      'Retrieve all active, approved vendor stores. Supports filtering by category and store name.',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter vendors by category ID',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search vendors by store name',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of matching vendors to return (1–50)',
  })
  @ApiOkResponse({
    type: ApiResponseDto<VendorProfileDto[]>,
  })
  async findAllVendors(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    data: VendorProfileDto[];
    meta: null;
  }> {
    const vendors = await this.vendorsService.findAllPublicVendors(
      categoryId,
      search,
      limit ? Number(limit) : undefined,
    );

    return {
      data: vendors,
      meta: null,
    };
  }

  /**
   * Returns only stores that are currently active and approved.
   */
  @Get(':storeSlug')
  @Message('Store profile retrieved successfully')
  @ApiOperation({
    summary: 'Get public store profile by slug',
    description:
      'Retrieve a vendor store profile by its slug. Only returns active, approved stores.',
  })
  @ApiParam({
    name: 'storeSlug',
    description: 'The store slug (e.g., "my-store")',
  })
  @ApiOkResponse({
    type: ApiResponseDto<VendorProfileDto>,
  })
  @ApiNotFoundResponse({
    description: 'Store not found',
  })
  async findStoreBySlug(
    @Param('storeSlug') storeSlug: string,
  ): Promise<VendorProfileDto> {
    return this.vendorsService.findStoreBySlug(storeSlug);
  }

  /**
   * Product listing is kept as a separate endpoint because product data
   * can be substantially larger than the vendor profile.
   */
  @Get(':storeSlug/products')
  @Message('Store products retrieved successfully')
  @ApiOperation({
    summary: 'Get public store products',
    description: 'Retrieve active products for a vendor store by slug.',
  })
  @ApiParam({
    name: 'storeSlug',
    description: 'The store slug (e.g., "my-store")',
  })
  @ApiOkResponse({
    type: ApiResponseDto<VendorProfileDto>,
    description: 'Store profile with products',
  })
  @ApiNotFoundResponse({
    description: 'Store not found',
  })
  async findStoreProducts(@Param('storeSlug') storeSlug: string) {
    return this.vendorsService.findStoreProducts(storeSlug);
  }
}
