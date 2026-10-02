import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  ANALYTICS_RANGES,
  AnalyticsRange,
} from '../../vendors/dto/vendor-analytics-query.dto';

export class AdminAnalyticsQueryDto {
  @ApiPropertyOptional({
    description:
      'Preset range for the analytics window. Ignored when startDate/endDate are provided.',
    enum: ANALYTICS_RANGES,
    default: '30d',
  })
  @IsOptional()
  @IsIn(ANALYTICS_RANGES)
  range?: AnalyticsRange;

  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Top N results for leaderboards',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  top?: number;
}
