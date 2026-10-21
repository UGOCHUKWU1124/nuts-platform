import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PaystackIpMiddleware } from './paystack-ip.middleware';

describe('PaystackIpMiddleware', () => {
  const createConfigService = (nodeEnv: string, paystackKey?: string) =>
    ({
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return nodeEnv;
        if (key === 'PAYSTACK_SECRET_KEY') return paystackKey;
        return undefined;
      }),
    }) as unknown as ConfigService;

  const createMockReq = (
    headers: Record<string, string | string[]>,
    ip = '127.0.0.1',
  ): Request =>
    ({
      headers,
      ip,
      socket: { remoteAddress: ip },
      path: '/api/v1/payments/webhook',
    }) as unknown as Request;

  const mockRes = {} as Response;
  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Non-production environments', () => {
    it('bypasses IP check when NODE_ENV is development', () => {
      const middleware = new PaystackIpMiddleware(
        createConfigService('development'),
      );
      const req = createMockReq({}, '192.168.1.1');

      middleware.use(req, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('bypasses IP check when NODE_ENV is test', () => {
      const middleware = new PaystackIpMiddleware(createConfigService('test'));
      const req = createMockReq({}, '10.0.0.1');

      middleware.use(req, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('Production environment', () => {
    let middleware: PaystackIpMiddleware;

    beforeEach(() => {
      middleware = new PaystackIpMiddleware(createConfigService('production'));
    });

    it('allows requests directly from a valid Paystack IP', () => {
      const req = createMockReq({}, '52.31.139.75');

      middleware.use(req, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('allows requests with x-forwarded-for matching Paystack IP', () => {
      const req = createMockReq({ 'x-forwarded-for': '52.49.173.169' });

      middleware.use(req, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('handles comma-separated x-forwarded-for behind a reverse proxy/load balancer', () => {
      // In production Nginx: client_ip, proxy1_ip, proxy2_ip
      const req = createMockReq({
        'x-forwarded-for': '52.214.14.220, 10.0.1.50, 172.18.0.2',
      });

      middleware.use(req, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('handles whitespace variations in x-forwarded-for header', () => {
      const req = createMockReq({
        'x-forwarded-for': '  52.31.139.75  , 192.168.1.1',
      });

      middleware.use(req, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('blocks requests from unauthorized IPs in production', () => {
      const req = createMockReq({ 'x-forwarded-for': '185.220.101.5' });

      expect(() => middleware.use(req, mockRes, mockNext)).toThrow(
        UnauthorizedException,
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('blocks requests with spoofed forwarded IP where client is not Paystack', () => {
      // Attacker appends spoofed header
      const req = createMockReq({
        'x-forwarded-for': '198.51.100.1, 52.31.139.75',
      });

      expect(() => middleware.use(req, mockRes, mockNext)).toThrow(
        UnauthorizedException,
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('bypasses IP check in production when using sk_test_ key for testing', () => {
      const testKeyMiddleware = new PaystackIpMiddleware(
        createConfigService('production', 'sk_test_mock123'),
      );
      const req = createMockReq({ 'x-forwarded-for': '185.220.101.5' });

      testKeyMiddleware.use(req, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });
});
