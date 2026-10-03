import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ToBoolean } from '@api/modules/shared/decorators/to-boolean.decorator';
import { CursorPaginationDto } from '@api/modules/shared/dto/cursor-pagination.dto';

/**
 * Product listing filters — sent in the POST body (not the query string).
 * Extends the shared cursor pagination input (limit + cursor).
 */
export class QueryProductsBodyDto extends CursorPaginationDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryPath?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional()
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  inStock?: boolean;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @IsOptional()
  minPrice?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Sorting criteria: newest, price_asc, price_desc',
  })
  @IsString()
  @IsOptional()
  sort?: string;
}
