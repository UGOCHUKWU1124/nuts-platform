import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ToBoolean } from 'src/modules/shared/decorators/to-boolean.decorator';
export class QueryProductDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryPath?: string;

  @ApiPropertyOptional({ description: 'Filter by category ID or slug' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by vendor ID' })
  @IsString()
  @IsOptional()
  vendorId?: string;

  @ApiPropertyOptional()
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  inStock?: boolean;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  minPrice?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxPrice?: number;

  /** Admin only: defaults to false (excludes soft-deleted). Pass true to list deleted products. */
  @ApiPropertyOptional({
    description: 'Admin: include soft-deleted products when true',
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  isDeleted?: boolean;

  /** Admin/Vendor: filter by active flag. Omit to include both active and inactive. */
  @ApiPropertyOptional({ description: 'Filter by isActive when set' })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Opaque cursor from the previous response (meta.nextCursor). Omit for the first page.',
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Sorting criteria: newest, price_asc, price_desc',
  })
  @IsString()
  @IsOptional()
  sort?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
