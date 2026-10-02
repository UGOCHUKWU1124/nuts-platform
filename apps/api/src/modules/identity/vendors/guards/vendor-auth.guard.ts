import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from 'src/modules/shared/decorators/public.decorator';

@Injectable()
export class VendorJwtAuthGuard
  extends AuthGuard('vendor-jwt')
  implements CanActivate
{
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const result = (await super.canActivate(context)) as boolean;
    const request = context
      .switchToHttp()
      .getRequest<Record<string, unknown>>();
    const user = request.user;

    if (typeof user !== 'object' || user === null) {
      return false;
    }

    return result;
  }
}

@Injectable()
export class VendorRefreshGuard extends AuthGuard('vendor-refresh-token') {
  private readonly logger = new Logger(VendorRefreshGuard.name);

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return (await super.canActivate(context)) as boolean;
    } catch (error) {
      const request = context.switchToHttp().getRequest<{ path?: string }>();
      this.logger.warn(
        {
          event: 'refresh_authentication_failed',
          role: 'vendor',
          path: request.path,
        },
        'Vendor refresh token authentication rejected',
      );
      throw error;
    }
  }
}
