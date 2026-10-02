// vendor-analytics.controller.ts

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthStrategy } from 'src/modules/shared/decorators/auth-strategy.decorator';
import { GetVendor } from 'src/modules/shared/decorators/get-vendor.decorator';
import { Message } from 'src/modules/shared/decorators/message.decorator';
import { ApiResponseDto } from 'src/modules/shared/dto/api-response.dto';
import { VendorJwtAuthGuard } from '../guards/vendor-auth.guard';
import { VendorAnalyticsQueryDto } from './dto/vendor-analytics-query.dto';
import { VendorAnalyticsSummaryDto } from './dto/vendor-analytics-summary.dto';
import { VendorAnalyticsService } from './vendor-analytics.service';

@ApiTags('VENDOR - ANALYTICS')
@Controller('vendors/analytics')
@AuthStrategy('vendor-jwt')
@UseGuards(VendorJwtAuthGuard)
export class VendorAnalyticsController {
  constructor(private readonly analyticsService: VendorAnalyticsService) {}

  @Get()
  @ApiBearerAuth('JWT-auth')
  @Message('Vendor analytics retrieved')
  @ApiOperation({
    summary: 'Get vendor store analytics with trends',
    description:
      "Retrieve aggregated analytics for the authenticated vendor's store, including order statistics, revenue, customer insights, product performance, and daily trends.",
  })
  @ApiResponse({
    status: 200,
    description: 'Vendor analytics retrieved successfully.',
    type: ApiResponseDto<VendorAnalyticsSummaryDto>,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid query parameters.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - vendor authentication required.',
  })
  async getAnalytics(
    @GetVendor('id') vendorId: string,
    @Query() query: VendorAnalyticsQueryDto,
  ): Promise<VendorAnalyticsSummaryDto> {
    return this.analyticsService.getAnalytics(vendorId, query);
  }
}
