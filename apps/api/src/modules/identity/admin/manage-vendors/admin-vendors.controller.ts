import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ROLE } from '@prisma/client';
import type { Request } from 'express';
import { VendorProfileDto } from '@api/modules/identity/vendors/dto/vendor-response.dto';
import { VendorStatusResponseDto } from '@api/modules/identity/vendors/dto/vendor-status-response.dto';
import { GetUser } from '@api/modules/shared/decorators/get-user.decorator';
import { Message } from '@api/modules/shared/decorators/message.decorator';
import { Roles } from '@api/modules/shared/decorators/role.decorator';
import { ApiResponseDto } from '@api/modules/shared/dto/api-response.dto';
import {
  extractIpAddress,
  extractUserAgent,
} from '@api/modules/shared/utils/request.util';
import { AdminVendorsService } from './admin-vendors.service';
import { QueryAdminVendorsDto } from './dto/query-admin-vendors.dto';

@ApiBearerAuth('JWT-auth')
@ApiTags('ADMIN - VENDORS')
@Roles(ROLE.ADMIN)
@Controller('admin/vendors')
export class AdminVendorsController {
  constructor(private readonly adminVendorsService: AdminVendorsService) {}

  @Get()
  @Message('Vendors retrieved successfully')
  @ApiOperation({
    summary: 'List vendors (admin)',
    description: 'Retrieve a paginated list of all vendors.',
  })
  @ApiResponse({ status: 200, type: ApiResponseDto<VendorProfileDto[]> })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized — no valid JWT session.',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden — user does not have ADMIN role.',
  })
  async findAll(
    @Query() query: QueryAdminVendorsDto,
    @Body() body?: QueryAdminVendorsDto,
  ) {
    const filters = {
      ...query,
      ...(body && typeof body === 'object' && Object.keys(body).length > 0
        ? body
        : {}),
    };
    return this.adminVendorsService.findAll(filters);
  }

  /** Cursor-based query — filters travel in the request body. */
  @Post('query')
  @HttpCode(HttpStatus.OK)
  @Message('Vendors retrieved successfully')
  @ApiOperation({
    summary: 'List vendors (cursor pagination, filters in body)',
  })
  @ApiResponse({ status: 200, type: ApiResponseDto<VendorProfileDto[]> })
  async query(@Body() body: QueryAdminVendorsDto) {
    return this.adminVendorsService.findAll(body);
  }

  @Get(':id')
  @Message('Vendor retrieved successfully')
  @ApiOperation({
    summary: 'Get vendor by ID',
    description: 'Retrieve a single vendor by their unique ID.',
  })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  @ApiResponse({ status: 200, type: ApiResponseDto<VendorProfileDto> })
  @ApiNotFoundResponse({ description: 'Vendor not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VendorProfileDto> {
    return this.adminVendorsService.findOne(id);
  }

  @Patch(':id/approve')
  @Message('Vendor approved successfully')
  @ApiOperation({
    summary: 'Approve vendor account (admin)',
    description: 'Approve a pending vendor account.',
  })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  @ApiResponse({ status: 200, type: ApiResponseDto<VendorStatusResponseDto> })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized — no valid JWT session.',
  })
  @ApiNotFoundResponse({ description: 'Vendor not found.' })
  async approve(
    @GetUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<VendorStatusResponseDto> {
    return this.adminVendorsService.approve(
      adminId,
      id,
      extractIpAddress(req),
      extractUserAgent(req),
    );
  }

  @Patch(':id/verify')
  @Message('Vendor verified successfully')
  @ApiOperation({
    summary: 'Verify vendor account (admin)',
    description: 'Verify a vendor account to grant verified status.',
  })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  @ApiResponse({ status: 200, type: ApiResponseDto<VendorStatusResponseDto> })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized — no valid JWT session.',
  })
  @ApiNotFoundResponse({ description: 'Vendor not found.' })
  async verify(
    @GetUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<VendorStatusResponseDto> {
    return this.adminVendorsService.verify(
      adminId,
      id,
      extractIpAddress(req),
      extractUserAgent(req),
    );
  }

  @Patch(':id/deactivate')
  @Message('Vendor deactivated successfully')
  @ApiOperation({
    summary: 'Deactivate vendor account (admin)',
    description: 'Deactivate a vendor account, removing public visibility.',
  })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  @ApiResponse({ status: 200, type: ApiResponseDto<VendorStatusResponseDto> })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized — no valid JWT session.',
  })
  @ApiNotFoundResponse({ description: 'Vendor not found.' })
  async deactivate(
    @GetUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<VendorStatusResponseDto> {
    return this.adminVendorsService.deactivate(
      adminId,
      id,
      extractIpAddress(req),
      extractUserAgent(req),
    );
  }

  @Patch(':id/reactivate')
  @Message('Vendor reactivated successfully')
  @ApiOperation({
    summary: 'Reactivate vendor account (admin)',
    description: 'Reactivate a previously deactivated vendor account.',
  })
  @ApiParam({ name: 'id', description: 'Vendor ID' })
  @ApiResponse({ status: 200, type: ApiResponseDto<VendorStatusResponseDto> })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized — no valid JWT session.',
  })
  @ApiNotFoundResponse({ description: 'Vendor not found.' })
  async reactivate(
    @GetUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<VendorStatusResponseDto> {
    return this.adminVendorsService.reactivate(
      adminId,
      id,
      extractIpAddress(req),
      extractUserAgent(req),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Message('Vendor permanently deleted successfully')
  @ApiOperation({
    summary: 'Delete vendor account permanently (admin)',
    description: 'Permanently delete a vendor account and all associated data.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized — no valid JWT session.',
  })
  @ApiNotFoundResponse({ description: 'Vendor not found.' })
  async delete(
    @GetUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.adminVendorsService.delete(
      adminId,
      id,
      extractIpAddress(req),
      extractUserAgent(req),
    );
  }
}
