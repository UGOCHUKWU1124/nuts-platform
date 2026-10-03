import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AddedFromDto {
  @ApiProperty({ enum: ['CATEGORY_PAGE', 'PRODUCT_PAGE'] })
  @IsString()
  @IsIn(['CATEGORY_PAGE', 'PRODUCT_PAGE'])
  type!: 'CATEGORY_PAGE' | 'PRODUCT_PAGE';

  @ApiPropertyOptional({
    description: 'Original client route where the item was added from',
    example: '/category/beauty/bath-and-body/onyx-polish',
  })
  @IsOptional()
  @IsString()
  path?: string;
}

/**
 * Accepts both the canonical object shape `{ type: "PRODUCT_PAGE", path?: string }` and
 * legacy flat string values (e.g. `"web"`, `"PRODUCT_PAGE"`), mapping any
 * unknown string to `PRODUCT_PAGE`, returning an instance of AddedFromDto.
 */
function normalizeAddedFrom(value: unknown): AddedFromDto | undefined {
  if (!value) return undefined;
  if (value instanceof AddedFromDto) return value;
  const dto = new AddedFromDto();
  if (typeof value === 'string') {
    dto.type = ['CATEGORY_PAGE', 'PRODUCT_PAGE'].includes(value)
      ? (value as 'CATEGORY_PAGE' | 'PRODUCT_PAGE')
      : 'PRODUCT_PAGE';
    return dto;
  }
  if (value && typeof value === 'object' && 'type' in value) {
    const v = value as Record<string, unknown>;
    dto.type = ['CATEGORY_PAGE', 'PRODUCT_PAGE'].includes(v.type as string)
      ? (v.type as 'CATEGORY_PAGE' | 'PRODUCT_PAGE')
      : 'PRODUCT_PAGE';
    if (typeof v.path === 'string') {
      dto.path = v.path;
    }
    return dto;
  }
  return undefined;
}

export class AddToCartQuantityDto {
  @ApiProperty({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    type: () => AddedFromDto,
    description: 'The page from which the item was added to cart',
    oneOf: [
      {
        type: 'object',
        properties: {
          type: { enum: ['CATEGORY_PAGE', 'PRODUCT_PAGE'] },
        },
      },
      { type: 'string', example: 'PRODUCT_PAGE' },
    ],
  })
  @IsOptional()
  @Transform(({ value }) => normalizeAddedFrom(value))
  @ValidateNested()
  @Type(() => AddedFromDto)
  addedFrom?: AddedFromDto;

  @ApiPropertyOptional({
    description:
      'Optional variant ID for product variants. Preferred over the variantId query parameter.',
  })
  @IsOptional()
  @IsString()
  variantId?: string;
}
