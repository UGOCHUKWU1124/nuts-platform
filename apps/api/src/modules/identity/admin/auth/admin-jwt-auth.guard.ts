import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ROLE } from '@prisma/client';
import type { RequestWithUser } from 'src/modules/shared/interfaces/request-with-user.interface';

@Injectable()
export class AdminJwtAuthGuard extends AuthGuard('jwt') {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = await super.canActivate(context);
    if (!authenticated) {
      throw new UnauthorizedException('Authentication required');
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user || user.role !== ROLE.ADMIN) {
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
