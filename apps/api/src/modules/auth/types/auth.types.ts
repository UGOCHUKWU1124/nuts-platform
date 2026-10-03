import type { ROLE } from '@prisma/client';

import type { AuthUserDto } from '../dto/auth-response.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshId: string;
}

export interface AuthSession {
  user: AuthUserDto;
  tokens: AuthTokens;
}

export interface RefreshableAccount {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: ROLE;
  isActive: boolean;
  tokenVersion: number;
  refreshToken: string | null;
  refreshTokenId: string | null;
}
