// vendor-account.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { AuthStrategy } from 'src/modules/shared/decorators/auth-strategy.decorator';
import { GetVendor } from 'src/modules/shared/decorators/get-vendor.decorator';
import { Message } from 'src/modules/shared/decorators/message.decorator';
import { Public } from 'src/modules/shared/decorators/public.decorator';
import { ApiResponseDto } from 'src/modules/shared/dto/api-response.dto';
import {
  extractIpAddress,
  extractUserAgent,
} from 'src/modules/shared/utils/request.util';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorReactivateDto } from './dto/vendor-reactivate.dto';
import { VendorProfileDto } from './dto/vendor-response.dto';
import { VendorStatusResponseDto } from './dto/vendor-status-response.dto';
import { VendorJwtAuthGuard } from './guards/vendor-auth.guard';
import { VendorsService } from './vendors.service';

@ApiTags('VENDORS - ACCOUNT')
@Controller('vendors')
@AuthStrategy('vendor-jwt')
@UseGuards(VendorJwtAuthGuard)
export class VendorAccountController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @Message('Current session retrieved successfully')
  @ApiOperation({
    summary: 'Get the current vendor session identity',
    description:
      'Returns the full profile identity for the authenticated vendor.',
  })
  @ApiResponse({
    status: 200,
    type: ApiResponseDto<VendorProfileDto>,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
  })
  async me(@GetVendor('id') vendorId: string): Promise<VendorProfileDto> {
    return this.vendorsService.getProfile(vendorId);
  }

  @Get('account')
  @ApiBearerAuth('JWT-auth')
  @Message('Profile retrieved successfully')
  @ApiOperation({
    summary: 'Get vendor profile',
    description: 'Retrieve the authenticated vendor profile.',
  })
  @ApiResponse({
    status: 200,
    type: ApiResponseDto<VendorProfileDto>,
  })
  @ApiNotFoundResponse({
    description: 'Vendor not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized',
  })
  async getProfile(
    @GetVendor('id') vendorId: string,
  ): Promise<VendorProfileDto> {
    return this.vendorsService.getProfile(vendorId);
  }

  @Patch('account')
  @ApiBearerAuth('JWT-auth')
  @Message('Profile updated successfully')
  @ApiOperation({
    summary: 'Update vendor profile',
    description: 'Update the authenticated vendor profile fields.',
  })
  @ApiBody({
    type: UpdateVendorDto,
  })
  @ApiResponse({
    status: 200,
    type: ApiResponseDto<VendorProfileDto>,
  })
  @ApiNotFoundResponse({
    description: 'Vendor not found',
  })
  @ApiConflictResponse({
    description: 'Email already in use',
  })
  async updateProfile(
    @GetVendor('id') vendorId: string,
    @Body() dto: UpdateVendorDto,
    @Req() req: Request,
  ): Promise<VendorProfileDto> {
    return this.vendorsService.updateProfile(
      vendorId,
      dto,
      extractIpAddress(req),
      extractUserAgent(req),
    );
  }

  /**
   * Reactivation is public because a deactivated vendor cannot authenticate
   * through the protected vendor routes.
   */
  @Public()
  @Post('account/reactivate')
  @HttpCode(HttpStatus.OK)
  @Message('Vendor account reactivated successfully')
  @ApiOperation({
    summary: 'Reactivate a deactivated vendor account',
    description:
      'Verify email and password to reactivate a deactivated vendor account. Then sign in via /vendors/login.',
  })
  @ApiBody({
    type: VendorReactivateDto,
  })
  @ApiResponse({
    status: 200,
    type: ApiResponseDto<VendorStatusResponseDto>,
  })
  @ApiBadRequestResponse({
    description: 'Invalid email or password',
  })
  @ApiConflictResponse({
    description: 'Account is not deactivated or grace period ended',
  })
  async reactivate(
    @Body() dto: VendorReactivateDto,
    @Req() req: Request,
  ): Promise<VendorStatusResponseDto> {
    return this.vendorsService.reactivate(
      dto,
      extractIpAddress(req),
      extractUserAgent(req),
    );
  }

  @Patch('account/deactivate')
  @ApiBearerAuth('JWT-auth')
  @Message('Vendor account deactivated successfully')
  @ApiOperation({
    summary: 'Deactivate vendor account',
    description: 'Deactivate the authenticated vendor account.',
  })
  @ApiResponse({
    status: 200,
    type: ApiResponseDto<VendorStatusResponseDto>,
  })
  @ApiNotFoundResponse({
    description: 'Vendor not found',
  })
  @ApiConflictResponse({
    description: 'Account is already deactivated',
  })
  async deactivateProfile(
    @GetVendor('id') vendorId: string,
    @Req() req: Request,
  ): Promise<VendorStatusResponseDto> {
    return this.vendorsService.deactivateProfile(
      vendorId,
      extractIpAddress(req),
      extractUserAgent(req),
    );
  }

  @Delete('account')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @Message('Vendor account deleted successfully')
  @ApiOperation({
    summary: 'Delete vendor account permanently',
    description:
      'Permanently delete the authenticated vendor account and all associated data.',
  })
  @ApiNotFoundResponse({
    description: 'Vendor not found',
  })
  @ApiOkResponse({
    type: ApiResponseDto<null>,
    description: 'Vendor account deleted successfully',
  })
  async deleteProfile(
    @GetVendor('id') vendorId: string,
    @Req() req: Request,
  ): Promise<null> {
    await this.vendorsService.deleteProfile(
      vendorId,
      extractIpAddress(req),
      extractUserAgent(req),
    );

    return null;
  }
}
