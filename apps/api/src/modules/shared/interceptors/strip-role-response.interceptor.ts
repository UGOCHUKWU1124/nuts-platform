import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

export function withoutRoleFields<T>(
  value: T,
  seen = new WeakMap<object, unknown>(),
): T {
  if (value === null || typeof value !== 'object') return value;
  if (
    value instanceof Date ||
    Buffer.isBuffer(value) ||
    ArrayBuffer.isView(value)
  ) {
    return value;
  }

  const cacheKey = value as object;
  const cached = seen.get(cacheKey);
  if (cached) return cached as T;

  if (Array.isArray(value)) {
    const result: unknown[] = [];
    seen.set(cacheKey, result);
    for (const item of value) result.push(withoutRoleFields(item, seen));
    return result as T;
  }

  if (value instanceof Map || value instanceof Set) return value;

  const prototypeSource: object = value;
  const result = Object.create(
    Reflect.getPrototypeOf(prototypeSource),
  ) as Record<string, unknown>;
  const record = value as Record<string, unknown>;
  seen.set(cacheKey, result);

  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === 'role') continue;
    Object.defineProperty(result, key, {
      value: withoutRoleFields(record[key], seen),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  return result as T;
}

@Injectable()
export class StripRoleResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(map((value: unknown) => withoutRoleFields(value)));
  }
}
