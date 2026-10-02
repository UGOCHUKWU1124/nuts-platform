import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({
    description: 'Unique identifier of the authenticated user',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  id!: string;

  @ApiProperty({
    description: 'Email address of the authenticated user',
    example: 'jane@example.com',
  })
  email!: string;

  @ApiPropertyOptional({
    description: 'First name of the authenticated user',
    example: 'Jane',
    nullable: true,
  })
  firstName!: string | null;

  @ApiPropertyOptional({
    description: 'Last name of the authenticated user',
    example: 'Doe',
    nullable: true,
  })
  lastName!: string | null;
}

export class AuthResponseDto {
  @ApiProperty({
    description: 'Authenticated user details',
    type: AuthUserDto,
  })
  user!: AuthUserDto;

  @ApiPropertyOptional({
    description: 'JWT access token for Authorization header',
  })
  accessToken?: string;
}

export class AuthApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'User registered successfully' })
  message!: string;

  @ApiProperty({ type: AuthResponseDto })
  data!: AuthResponseDto;

  @ApiProperty({ example: '2026-09-18T22:00:00.000Z' })
  timestamp!: string;
}

export class RegisterResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the newly created user',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  userId!: string;

  @ApiProperty({
    description: 'Email address of the registered user',
    example: 'jane@example.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Whether email verification is required',
    example: true,
  })
  requiresVerification!: boolean;
}

export class VerifyOtpResponseDto {
  @ApiProperty({
    description: 'Whether OTP verification succeeded',
    example: true,
  })
  verified!: boolean;
}
