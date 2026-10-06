import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserIdentitySummaryDto } from '@api/modules/shared/dto/user-identity-summary.dto';

export { UserIdentitySummaryDto as AuthUserDto };

export class AuthResponseDto {
  @ApiProperty({
    description: 'Authenticated user details',
    type: UserIdentitySummaryDto,
  })
  user!: UserIdentitySummaryDto;

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
