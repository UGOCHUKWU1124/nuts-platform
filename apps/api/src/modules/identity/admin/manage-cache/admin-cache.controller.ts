import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ROLE } from '@prisma/client';
import { CacheService } from '@api/modules/infrastructure/cache/cache.service';
import { Message } from '@api/modules/shared/decorators/message.decorator';
import { Roles } from '@api/modules/shared/decorators/role.decorator';
import { ApiResponseDto } from '@api/modules/shared/dto/api-response.dto';

@ApiTags('ADMIN - CACHE')
@ApiBearerAuth('JWT-auth')
@Controller('admin/cache')
@Roles(ROLE.ADMIN)
export class AdminCacheController {
  constructor(private readonly cacheService: CacheService) {}

  @Get('flush')
  @HttpCode(HttpStatus.OK)
  @Message('Cache flushed successfully')
  @ApiOperation({
    summary: 'Flush entire Redis cache',
    description:
      '**Warning:** This endpoint permanently deletes ALL cached data (category tree, product listings, store profiles, etc.). ' +
      'Subsequent requests will hit the database directly until the cache is repopulated. ' +
      'Use sparingly — prefer letting TTLs expire naturally in most cases.',
  })
  @ApiResponse({
    status: 200,
    type: ApiResponseDto<{ message: string }>,
    description: 'All cached data has been flushed.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized — admin access required',
  })
  async flush(): Promise<{ message: string }> {
    await this.cacheService.clear();
    return { message: 'Cache flushed successfully' };
  }
}
