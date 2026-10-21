import { ApiProperty } from '@nestjs/swagger';

export class SearchBreakdownDto {
  @ApiProperty({ example: 42, description: 'Total active products' })
  products!: number;

  @ApiProperty({ example: 8, description: 'Total active approved vendors' })
  vendors!: number;

  @ApiProperty({ example: 12, description: 'Total active categories' })
  categories!: number;

  @ApiProperty({ example: 120, description: 'Total orders' })
  orders!: number;
}

export class SearchStatusDto {
  @ApiProperty({
    example: true,
    description: 'Indicates whether the search engine is operational',
  })
  ready!: boolean;

  @ApiProperty({
    example: 182,
    description: 'Total indexable documents in database',
  })
  totalDocuments!: number;

  @ApiProperty({
    type: SearchBreakdownDto,
    description: 'Breakdown by entity type',
  })
  breakdown!: SearchBreakdownDto;
}

export class SearchReindexResponseDto {
  @ApiProperty({
    example: 'Search indices synchronized and cache purged successfully',
    description: 'Operation status message',
  })
  message!: string;

  @ApiProperty({
    example: 182,
    description: 'Total documents currently indexed/available',
  })
  indexedCount!: number;
}
