import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VendorVariantResponseDto } from '@api/modules/product-variants/dto/vendor-variant-response.dto';
import type { VariantCombinations } from '@api/modules/shared/dto/variant-combinations.dto';

class VendorProductCategoryRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

class VendorProductImageDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiProperty() publicId!: string;
  @ApiProperty() position!: number;
  @ApiProperty() isCover!: boolean;
}

export class VendorProductResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty() sku!: string;
  @ApiProperty() hasVariants!: boolean;
  @ApiPropertyOptional() price?: number;
  @ApiProperty() stock!: number;
  @ApiProperty() inStock!: boolean;
  @ApiProperty() stockStatus!: string;
  @ApiPropertyOptional({
    type: () => VendorVariantResponseDto,
    isArray: true,
  })
  variants?: VendorVariantResponseDto[];

  @ApiPropertyOptional({
    description:
      'Grouped unique option values across all variants — useful for building filter UIs',
    example: { size: ['S', 'M', 'L'], color: ['Black', 'Red'] },
    type: 'object',
    additionalProperties: {
      type: 'array',
      items: { type: 'string' },
    },
  })
  variantCombinations?: VariantCombinations;
  @ApiProperty({ type: () => VendorProductCategoryRefDto })
  category!: VendorProductCategoryRefDto;

  @ApiPropertyOptional({ type: () => VendorProductCategoryRefDto })
  parentSubcategory?: VendorProductCategoryRefDto;

  @ApiPropertyOptional({ type: () => VendorProductCategoryRefDto })
  subcategory?: VendorProductCategoryRefDto;
  @ApiPropertyOptional({ type: () => VendorProductImageDto, isArray: true })
  images?: VendorProductImageDto[];
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isDeleted!: boolean;
  @ApiPropertyOptional() deletedAt?: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
