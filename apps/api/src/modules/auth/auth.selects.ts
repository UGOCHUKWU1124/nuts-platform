import type { Prisma } from '@prisma/client';

export const USER_AUTH_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  tokenVersion: true,
} as const satisfies Prisma.UserSelect;

export const USER_LOGIN_SELECT = {
  ...USER_AUTH_SELECT,
  password: true,
  isActive: true,
} as const satisfies Prisma.UserSelect;

export const USER_REFRESH_SELECT = {
  ...USER_AUTH_SELECT,
  isActive: true,
  refreshToken: true,
  refreshTokenId: true,
} as const satisfies Prisma.UserSelect;

export const ADMIN_REFRESH_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  tokenVersion: true,
  refreshToken: true,
  refreshTokenId: true,
} as const satisfies Prisma.AdminSelect;

export const VENDOR_REFRESH_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  isApproved: true,
  tokenVersion: true,
  refreshToken: true,
  refreshTokenId: true,
} as const satisfies Prisma.VendorSelect;

export type UserAuthRecord = Prisma.UserGetPayload<{
  select: typeof USER_AUTH_SELECT;
}>;

export type UserLoginRecord = Prisma.UserGetPayload<{
  select: typeof USER_LOGIN_SELECT;
}>;

export type UserRefreshRecord = Prisma.UserGetPayload<{
  select: typeof USER_REFRESH_SELECT;
}>;
