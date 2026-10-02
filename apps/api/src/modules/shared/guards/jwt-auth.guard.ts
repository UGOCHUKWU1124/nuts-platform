import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { firstValueFrom, isObservable } from 'rxjs';
import { AUTH_STRATEGY_KEY } from 'src/modules/shared/decorators/auth-strategy.decorator';
import { IS_PUBLIC_KEY } from 'src/modules/shared/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly defaultGuard = new (AuthGuard('jwt'))();

  constructor(private readonly reflector: Reflector) {}

  private async executeGuard(
    guard: CanActivate,
    context: ExecutionContext,
  ): Promise<boolean> {
    const result = guard.canActivate(context);
    if (isObservable(result)) {
      return firstValueFrom(result);
    }
    return result;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const authStrategy = this.reflector.getAllAndOverride<string>(
      AUTH_STRATEGY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (authStrategy && authStrategy !== 'jwt') {
      return true;
    }

    return this.executeGuard(this.defaultGuard, context);
  }
}
