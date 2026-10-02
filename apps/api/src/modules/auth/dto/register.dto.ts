import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { MaxPasswordBytes } from 'src/modules/shared/decorators/max-password-bytes.decorator';
import { NormalizeEmail } from 'src/modules/shared/decorators/normalize-email.decorator';
import { Trim } from 'src/modules/shared/decorators/string-trim.decorator';

export class ShippingAddressRegistrationDto {
  @ApiProperty({
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MaxLength(100)
  fullName!: string;

  @ApiProperty({
    example: '+2348012345678',
  })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  @MaxLength(30)
  phone!: string;

  @ApiProperty({
    example: '123 Main Street, Victoria Island',
  })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Street address is required' })
  @MaxLength(255)
  street!: string;

  @ApiProperty({
    example: 'Lagos',
  })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  @MaxLength(100)
  city!: string;

  @ApiProperty({
    example: 'Lagos State',
  })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'State is required' })
  @MaxLength(100)
  state!: string;

  @ApiPropertyOptional({
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

export class RegisterDto {
  @ApiProperty({
    example: 'jane@example.com',
  })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({
    example: 'StrongPassword123!',
  })
  @IsString()
  @MinLength(12, {
    message: 'Password must be at least 12 characters',
  })
  @MaxLength(128)
  @MaxPasswordBytes()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#]).*$/, {
    message:
      'Password must contain uppercase, lowercase, number and special character',
  })
  password!: string;

  @ApiProperty({
    example: '123456',
  })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'OTP code is required' })
  @Matches(/^\d{6}$/, {
    message: 'OTP code must be 6 digits',
  })
  otpCode!: string;

  @ApiPropertyOptional({
    example: 'Jane',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Doe',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    example: '+2348012345678',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Optional referral code from another user',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  referralCode?: string;

  @ApiPropertyOptional({
    description: 'Optional shipping address collected during registration',
    type: ShippingAddressRegistrationDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressRegistrationDto)
  shippingAddress?: ShippingAddressRegistrationDto;
}
