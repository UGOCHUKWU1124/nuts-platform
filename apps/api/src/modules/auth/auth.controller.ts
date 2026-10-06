import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { AuthCookieService } from './cookies/auth-cookie.service';

import { AuthApiResponseDto, AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

import { AccountLockGuard } from '@api/modules/security/guards/account-lock.guard';
import { JwtAuthGuard } from '@api/modules/shared/guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

import { Message } from '@api/modules/shared/decorators/message.decorator';
import { Public } from '@api/modules/shared/decorators/public.decorator';

import {
  PasswordResetThrottle,
  RefreshTokenThrottle,
  StrictThrottle,
} from '@api/modules/shared/decorators/custom-throttler.decorator';

import { GetUser } from '@api/modules/shared/decorators/get-user.decorator';

import {
  extractIpAddress,
  extractUserAgent,
} from '@api/modules/shared/utils/request.util';

import { ApiResponseDto } from '@api/modules/shared/dto/api-response.dto';

import { ROLE } from '@prisma/client';
import { Roles } from '@api/modules/shared/decorators/role.decorator';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import type { RefreshJwtPayload } from './types/refresh-jwt-payload.type';
import {
  authCookieNames,
  AuthCookieRole,
} from './constants/auth-cookies.constants';

function getCookieValue(cookies: unknown, name: string): string | undefined {
  if (typeof cookies !== 'object' || cookies === null || !(name in cookies)) {
    return undefined;
  }
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

@ApiTags('AUTH')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookies: AuthCookieService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Roles(ROLE.USER)
  @Get('me')
  @Message('Current session retrieved successfully')
  @ApiOperation({
    summary: 'Get the authenticated user',
  })
  @ApiOkResponse({
    description: 'Current authenticated user.',
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
  })
  me(@GetUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  @Public()
  @StrictThrottle()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Message('User registered successfully')
  @ApiOperation({
    summary: 'Register a new user account',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({
    description: 'User registered successfully.',
    type: AuthApiResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation error or invalid OTP',
  })
  @ApiConflictResponse({
    description: 'An account with this email already exists',
  })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const session = await this.authService.register(
      dto,
      extractIpAddress(req),
      extractUserAgent(req),
    );

    this.authCookies.setAuthCookies(res, session.tokens, 'user');

    return {
      user: session.user,
      accessToken: session.tokens.accessToken,
    };
  }

  @Public()
  @StrictThrottle()
  @UseGuards(AccountLockGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Message('Logged in successfully')
  @ApiOperation({
    summary: 'Log in with email and password',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Login successful.',
    type: AuthApiResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const session = await this.authService.login(
      dto,
      extractIpAddress(req),
      extractUserAgent(req),
    );

    this.authCookies.setAuthCookies(res, session.tokens, 'user');

    return {
      user: session.user,
      accessToken: session.tokens.accessToken,
    };
  }

  @Public()
  @RefreshTokenThrottle()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Rotates the refresh session and issues a new access token.',
  })
  @ApiOkResponse({
    description: 'Tokens refreshed successfully.',
    type: ApiResponseDto<AuthResponseDto>,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or rotated refresh token',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many refresh attempts.',
  })
  async refresh(
    @GetUser() payload: RefreshJwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    /**
     * Passing the refreshId is essential.
     *
     * AuthService uses it as a compare-and-swap value so two
     * simultaneous refresh requests cannot both rotate the same session.
     */
    const session = await this.authService.refresh(payload);

    const roleScope: AuthCookieRole =
      payload.role === ROLE.ADMIN
        ? 'admin'
        : payload.role === ROLE.VENDOR
          ? 'vendor'
          : 'user';

    this.authCookies.setAuthCookies(res, session.tokens, roleScope);

    return {
      user: session.user,
      accessToken: session.tokens.accessToken,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Message('Successfully logged out')
  @ApiOperation({
    summary: 'Log out the current user',
  })
  @ApiOkResponse({
    description: 'Logged out successfully.',
    type: ApiResponseDto<null>,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
  })
  async logout(
    @GetUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    const roleScope: AuthCookieRole =
      user.role === ROLE.ADMIN
        ? 'admin'
        : user.role === ROLE.VENDOR
          ? 'vendor'
          : 'user';
    const refreshToken = getCookieValue(
      req.cookies as unknown,
      authCookieNames(roleScope).refresh,
    );

    await this.authService.logout(
      user.id,
      user.role,
      user.sessionId,
      refreshToken,
      extractIpAddress(req),
      extractUserAgent(req),
    );

    this.authCookies.clearAuthCookies(res, roleScope);

    return null;
  }

  // ---------------------------------------------------------------------------
  // OTP & PASSWORD RESET
  // ---------------------------------------------------------------------------

  @Public()
  @StrictThrottle()
  @Post(['otp/request', 'register/otp', 'request-otp'])
  @HttpCode(HttpStatus.OK)
  @Message('Verification code sent to your email')
  @ApiOperation({
    summary: 'Request OTP for registration',
    description:
      'Sends a 6-digit verification code to the provided email address to verify ownership before registration.',
  })
  @ApiBody({ type: RequestOtpDto })
  @ApiOkResponse({
    description: 'Verification code sent successfully.',
    type: ApiResponseDto<null>,
  })
  @ApiBadRequestResponse({
    description: 'Invalid email address or rate limit exceeded',
  })
  @ApiConflictResponse({
    description: 'An account with this email already exists',
  })
  async requestRegistrationOtp(@Body() dto: RequestOtpDto): Promise<null> {
    await this.authService.requestRegistrationOtp(dto);
    return null;
  }

  @Public()
  @PasswordResetThrottle()
  @Post([
    'forgot-password/otp/request',
    'forgot-password/otp',
    'forgot-password',
    'password-reset/otp',
  ])
  @HttpCode(HttpStatus.OK)
  @Message(
    'If an account exists with this email, a verification code has been sent.',
  )
  @ApiOperation({
    summary: 'Request OTP for forgot password / password reset',
    description:
      'Sends a 6-digit verification code to the provided email address if an active account exists.',
  })
  @ApiBody({ type: RequestOtpDto })
  @ApiOkResponse({
    description: 'Password reset code sent.',
    type: ApiResponseDto<null>,
  })
  @ApiBadRequestResponse({
    description: 'Invalid email address or rate limit exceeded',
  })
  async requestPasswordResetOtp(@Body() dto: RequestOtpDto): Promise<null> {
    await this.authService.requestPasswordResetOtp(dto);
    return null;
  }

  @Public()
  @PasswordResetThrottle()
  @Post(['reset-password', 'forgot-password/reset'])
  @HttpCode(HttpStatus.OK)
  @Message('Password reset successfully')
  @ApiOperation({
    summary: 'Reset password using OTP',
    description:
      'Verifies the 6-digit OTP code and updates the account password.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({
    description: 'Password reset successfully.',
    type: ApiResponseDto<null>,
  })
  @ApiBadRequestResponse({
    description: 'Validation error or invalid OTP code',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired OTP code',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
  ): Promise<null> {
    await this.authService.resetPassword(
      dto,
      extractIpAddress(req),
      extractUserAgent(req),
    );
    return null;
  }
}
