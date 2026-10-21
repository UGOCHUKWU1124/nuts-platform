import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AddToCartQuantityDto {
  @ApiProperty({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description:
      'Optional variant ID for product variants. Preferred over the variantId query parameter.',
  })
  @IsOptional()
  @IsString()
  variantId?: string;
}
