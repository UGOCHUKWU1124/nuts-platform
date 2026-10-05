import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VendorProfileDto } from '@api/modules/identity/vendors/dto/vendor-response.dto';
import { VendorStatusResponseDto } from '@api/modules/identity/vendors/dto/vendor-status-response.dto';
import { PrismaService } from '@api/modules/infrastructure/prisma/prisma.service';
import {
  AuditLogService,
  toAuditPayload,
} from '@api/modules/shared/audit-log/audit-log.service';
import { createPaginationMeta } from '@api/modules/shared/utils/pagination-meta.util';
import { getPagination } from '@api/modules/shared/utils/pagination.util';
import { QueryAdminVendorsDto } from './dto/query-admin-vendors.dto';

const vendorSelect = {
  id: true,
  email: true,
  storeName: true,
  storeSlug: true,
  storeDescription: true,
  businessPhone: true,
  businessEmail: true,
  storeLogoUrl: true,
  storeLogoAltText: true,
  isVerified: true,
  isActive: true,
  isApproved: true,
  firstName: true,
  lastName: true,
  phone: true,
  createdAt: true,
  updatedAt: true,
} as const;

type VendorSelectPayload = Prisma.VendorGetPayload<{
  select: typeof vendorSelect;
}>;

@Injectable()
export class AdminVendorsService {
  private readonly vendorSelect = vendorSelect;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(query: QueryAdminVendorsDto): Promise<{
    data: VendorProfileDto[];
    meta: ReturnType<typeof createPaginationMeta>;
  }> {
    const {
      page = 1,
      limit = 10,
      search,
      isActive,
      isApproved,
      isVerified,
    } = query;

    const where: Prisma.VendorWhereInput = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { storeName: { contains: search, mode: 'insensitive' } },
        { storeSlug: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (isApproved !== undefined) {
      where.isApproved = isApproved;
    }

    if (isVerified !== undefined) {
      where.isVerified = isVerified;
    }

    const [total, vendors] = await Promise.all([
      this.prisma.vendor.count({ where }),
      this.prisma.vendor.findMany({
        where,
        select: this.vendorSelect,
        orderBy: { createdAt: 'desc' },
        ...getPagination(page, limit),
      }),
    ]);

    return {
      data: vendors.map((vendor) => this.toVendorProfile(vendor)),
      meta: createPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string): Promise<VendorProfileDto> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      select: this.vendorSelect,
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return this.toVendorProfile(vendor);
  }

  async approve(
    adminId: string,
    id: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<VendorStatusResponseDto> {
    const before = await this.prisma.vendor.findUnique({
      where: { id },
      select: { isApproved: true },
    });

    const vendor = await this.prisma.vendor.update({
      where: { id },
      data: {
        isApproved: true,
        tokenVersion: { increment: 1 },
      },
      select: {
        id: true,
        isActive: true,
        isApproved: true,
        isVerified: true,
        updatedAt: true,
        email: true,
        storeName: true,
      },
    });

    await this.auditLog.log({
      action: 'APPROVE_VENDOR',
      entity: 'Vendor',
      entityId: id,
      adminId,
      payload: toAuditPayload({
        email: vendor.email,
        storeName: vendor.storeName,
        changes: {
          isApproved: { old: before?.isApproved ?? false, new: true },
        },
      }),
      ipAddress,
      userAgent,
    });

    return {
      id: vendor.id,
      isActive: vendor.isActive,
      isApproved: vendor.isApproved,
      isVerified: vendor.isVerified,
      updatedAt: vendor.updatedAt,
    };
  }

  async verify(
    adminId: string,
    id: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<VendorStatusResponseDto> {
    const before = await this.prisma.vendor.findUnique({
      where: { id },
      select: { isVerified: true },
    });

    const vendor = await this.prisma.vendor.update({
      where: { id },
      data: { isVerified: true },
      select: {
        id: true,
        isActive: true,
        isApproved: true,
        isVerified: true,
        updatedAt: true,
        email: true,
        storeName: true,
      },
    });

    await this.auditLog.log({
      action: 'VERIFY_VENDOR',
      entity: 'Vendor',
      entityId: id,
      adminId,
      payload: toAuditPayload({
        email: vendor.email,
        storeName: vendor.storeName,
        changes: {
          isVerified: { old: before?.isVerified ?? false, new: true },
        },
      }),
      ipAddress,
      userAgent,
    });

    return {
      id: vendor.id,
      isActive: vendor.isActive,
      isApproved: vendor.isApproved,
      isVerified: vendor.isVerified,
      updatedAt: vendor.updatedAt,
    };
  }

  async deactivate(
    adminId: string,
    id: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<VendorStatusResponseDto> {
    const before = await this.prisma.vendor.findUnique({
      where: { id },
      select: { isActive: true },
    });

    const vendor = await this.prisma.vendor.update({
      where: { id },
      data: {
        isActive: false,
        refreshToken: null,
        refreshTokenId: null,
        tokenVersion: { increment: 1 },
      },
      select: {
        id: true,
        isActive: true,
        isApproved: true,
        isVerified: true,
        updatedAt: true,
        email: true,
        storeName: true,
      },
    });

    await this.auditLog.log({
      action: 'DEACTIVATE_VENDOR',
      entity: 'Vendor',
      entityId: id,
      adminId,
      payload: toAuditPayload({
        email: vendor.email,
        storeName: vendor.storeName,
        changes: {
          isActive: { old: before?.isActive ?? true, new: false },
        },
      }),
      ipAddress,
      userAgent,
    });

    return {
      id: vendor.id,
      isActive: vendor.isActive,
      isApproved: vendor.isApproved,
      isVerified: vendor.isVerified,
      updatedAt: vendor.updatedAt,
    };
  }

  async reactivate(
    adminId: string,
    id: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<VendorStatusResponseDto> {
    const before = await this.prisma.vendor.findUnique({
      where: { id },
      select: { isActive: true },
    });

    const vendor = await this.prisma.vendor.update({
      where: { id },
      data: {
        isActive: true,
        tokenVersion: { increment: 1 },
      },
      select: {
        id: true,
        isActive: true,
        isApproved: true,
        isVerified: true,
        updatedAt: true,
        email: true,
        storeName: true,
      },
    });

    await this.auditLog.log({
      action: 'REACTIVATE_VENDOR',
      entity: 'Vendor',
      entityId: id,
      adminId,
      payload: toAuditPayload({
        email: vendor.email,
        storeName: vendor.storeName,
        changes: {
          isActive: { old: before?.isActive ?? false, new: true },
        },
      }),
      ipAddress,
      userAgent,
    });

    return {
      id: vendor.id,
      isActive: vendor.isActive,
      isApproved: vendor.isApproved,
      isVerified: vendor.isVerified,
      updatedAt: vendor.updatedAt,
    };
  }

  async delete(
    adminId: string,
    id: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    let vendor: { id: string; email: string; storeName: string };
    try {
      vendor = await this.prisma.vendor.delete({
        where: { id },
        select: { id: true, email: true, storeName: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Vendor not found');
      }
      throw error;
    }

    await this.auditLog.log({
      action: 'DELETE_VENDOR',
      entity: 'Vendor',
      entityId: id,
      adminId,
      payload: toAuditPayload({
        email: vendor.email,
        storeName: vendor.storeName,
      }),
      ipAddress,
      userAgent,
    });
  }

  private toVendorProfile(vendor: VendorSelectPayload): VendorProfileDto {
    return {
      id: vendor.id,
      email: vendor.email,
      storeName: vendor.storeName,
      storeSlug: vendor.storeSlug,
      storeDescription: vendor.storeDescription,
      businessPhone: vendor.businessPhone,
      businessEmail: vendor.businessEmail,
      storeLogoUrl: vendor.storeLogoUrl,
      storeLogoAltText: vendor.storeLogoAltText,
      firstName: vendor.firstName,
      lastName: vendor.lastName,
      phone: vendor.phone,
      isVerified: vendor.isVerified,
      isActive: vendor.isActive,
      isApproved: vendor.isApproved,
      createdAt: vendor.createdAt,
      updatedAt: vendor.updatedAt,
    };
  }
}
