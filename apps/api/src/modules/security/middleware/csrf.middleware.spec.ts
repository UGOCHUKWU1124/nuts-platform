import type { NextFunction, Request, Response } from 'express';
import { CsrfMiddleware } from './csrf.middleware';

describe('CsrfMiddleware', () => {
  const token = 'a'.repeat(64);
  let middleware: CsrfMiddleware;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.MockedFunction<NextFunction>;
  let status: jest.Mock;
  let json: jest.Mock;

  beforeEach(() => {
    middleware = new CsrfMiddleware(['https://shop.example.com'], true);
    req = {
      method: 'POST',
      path: '/api/v1/orders',
      ip: '127.0.0.1',
      headers: {
        origin: 'https://shop.example.com',
        'sec-fetch-site': 'same-site',
        'x-csrf-token': token,
      },
      cookies: { csrf_token: token },
    };
    status = jest.fn().mockReturnThis();
    json = jest.fn().mockReturnThis();
    res = { status, json };
    next = jest.fn();
  });

  it('accepts a trusted origin with a matching CSRF cookie and header', () => {
    middleware.use(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('rejects an untrusted origin before route execution', () => {
    req.headers = { ...req.headers, origin: 'https://attacker.example' };
    middleware.use(req as Request, res as Response, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a valid-looking header when the CSRF cookie is missing', () => {
    req.cookies = {};
    middleware.use(req as Request, res as Response, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows bearer-authenticated requests without a CSRF cookie', () => {
    req.cookies = {};
    req.headers = {
      ...req.headers,
      authorization: 'Bearer access-token',
    };
    middleware.use(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });
});
