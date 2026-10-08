import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ROLE } from '@prisma/client';

import { Roles } from '@api/modules/shared/decorators/role.decorator';
import { ApiResponseDto } from '@api/modules/shared/dto/api-response.dto';
import { SearchService } from '@api/modules/shared/search/search.service';
import { QuerySearchDto } from './dto/query-search.dto';
import { SearchResponseDto, SearchResultDto } from './dto/search-result.dto';

@ApiExtraModels(SearchResultDto, ApiResponseDto)
@ApiTags('ADMIN - SEARCH')
@ApiBearerAuth('JWT-auth')
@Controller('admin/search')
@Roles(ROLE.ADMIN)
export class AdminSearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({
    summary:
      'Admin global search across users, vendors, products, orders, and discount codes',
    description:
      'Search across all entities in the system. Requires ADMIN role.',
  })
  @ApiResponse({
    status: 200,
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
                $ref: getSchemaPath(SearchResultDto),
              },
            },
          },
        },
      ],
    },
  })
  async search(@Query() query: QuerySearchDto): Promise<SearchResponseDto> {
    const page = query.page ?? 1;

    const limit = query.limit ?? 20;

    const result = await this.searchService.searchAdminGlobal(
      query.query ?? '',
      query.types,
      page,
      limit,
    );

    return (result ?? {
      results: [],
      pagination: {
        totalItems: 0,
        page,
        limit,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }) as SearchResponseDto;
  }

  @Get('autocomplete')
  @ApiOperation({
    summary: 'Admin autocomplete search suggestions',
    description:
      'Get autocomplete suggestions for admin search. Requires ADMIN role.',
  })
  @ApiResponse({
    status: 200,
    type: ApiResponseDto,
  })
  async autocomplete(
    @Query() query: QuerySearchDto,
  ): Promise<SearchResponseDto> {
    const limit = query.limit ?? 10;

    const results = await this.searchService.autocomplete(
      query.query ?? '',
      query.types,
      limit,
    );

    return {
      results: results ?? [],
      pagination: {
        totalItems: results?.length ?? 0,
        page: 1,
        limit,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }
}
