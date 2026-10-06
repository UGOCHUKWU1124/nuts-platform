import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../decorators/string-trim.decorator';

export class ShippingAddressDto {
  @ApiProperty({ description: 'Full name of the delivery recipient' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;

  @ApiProperty({ description: 'Phone number for delivery contact' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @ApiProperty({ description: 'Street address' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  street!: string;

  @ApiProperty({ description: 'City' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiProperty({ description: 'State or region' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state!: string;

  @ApiPropertyOptional({
    description: 'Country name',
    example: 'Nigeria',
    default: 'Nigeria',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country?: string;
}
