import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MaxPasswordBytes } from '@api/modules/shared/decorators/max-password-bytes.decorator';

export class UpdateVendorDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(120)
  storeName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  storeDescription?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  businessPhone?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  businessEmail?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  storeLogoUrl?: string;
}

export class VendorLoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxPasswordBytes()
  password!: string;
}
