import { PartialType } from '@nestjs/swagger';
import {
  CreateAdminDiscountCodeDto,
  CreateDiscountCodeDto,
  CreateVendorDiscountCodeDto,
} from './create-discount-code.dto';

/**
 * Base DTO for updating existing discount codes.
 * All fields from CreateDiscountCodeDto are made optional.
 */
export class UpdateDiscountCodeDto extends PartialType(CreateDiscountCodeDto) {}

/**
 * Admin update DTO for platform discount codes.
 */
export class UpdateAdminDiscountCodeDto extends PartialType(
  CreateAdminDiscountCodeDto,
) {}

/**
 * Vendor update DTO for vendor-scoped discount codes.
 */
export class UpdateVendorDiscountCodeDto extends PartialType(
  CreateVendorDiscountCodeDto,
) {}
