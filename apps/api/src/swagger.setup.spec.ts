import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { setupSwagger } from './swagger.setup';

jest.mock('@nestjs/swagger', () => ({
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
    addServer: jest.fn().mockReturnThis(),
    addTag: jest.fn().mockReturnThis(),
    addBearerAuth: jest.fn().mockReturnThis(),
    addCookieAuth: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({}),
  })),
  SwaggerModule: {
    createDocument: jest.fn().mockReturnValue({ paths: {} }),
    setup: jest.fn(),
  },
}));

describe('setupSwagger', () => {
  let mockApp: Partial<INestApplication>;
  let mockConfig: Partial<ConfigService>;
  let mockExpressApp: { get: jest.Mock };
  let mockLogger: { log: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockExpressApp = {
      get: jest.fn(),
    };

    mockLogger = {
      log: jest.fn(),
    };

    mockApp = {
      getHttpAdapter: jest.fn().mockReturnValue({
        getInstance: jest.fn().mockReturnValue(mockExpressApp),
      }),
      get: jest.fn().mockReturnValue(mockLogger),
    };
  });

  it('MUST NOT initialize Swagger in production environment (Zero-Trust Security Gate)', () => {
    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'SWAGGER_ENABLED') return true; // Even if accidentally enabled
        return undefined;
      }),
    };

    setupSwagger(mockApp as INestApplication, mockConfig as ConfigService);

    expect(SwaggerModule.setup).not.toHaveBeenCalled();
    expect(SwaggerModule.createDocument).not.toHaveBeenCalled();
    expect(mockExpressApp.get).not.toHaveBeenCalled();
  });

  it('initializes Swagger and documentation routes in development environment', () => {
    mockConfig = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'PORT') return defaultValue ?? 3001;
        return undefined;
      }),
    };

    setupSwagger(mockApp as INestApplication, mockConfig as ConfigService);

    expect(SwaggerModule.setup).toHaveBeenCalledWith(
      'api/docs',
      mockApp,
      expect.any(Object),
      expect.objectContaining({
        jsonDocumentUrl: 'api/docs-json',
        yamlDocumentUrl: 'api/docs-yaml',
      }),
    );
    expect(mockExpressApp.get).toHaveBeenCalledWith(
      ['/docs', '/documentation', '/api/docs.json'],
      expect.any(Function),
    );
  });

  it('initializes Swagger and documentation routes in staging environment', () => {
    mockConfig = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'NODE_ENV') return 'staging';
        if (key === 'PORT') return defaultValue ?? 3001;
        return undefined;
      }),
    };

    setupSwagger(mockApp as INestApplication, mockConfig as ConfigService);

    expect(SwaggerModule.setup).toHaveBeenCalledWith(
      'api/docs',
      mockApp,
      expect.any(Object),
      expect.objectContaining({
        jsonDocumentUrl: 'api/docs-json',
        yamlDocumentUrl: 'api/docs-yaml',
      }),
    );
  });

  it('does NOT initialize Swagger if explicitly disabled via SWAGGER_ENABLED=false in staging', () => {
    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'staging';
        if (key === 'SWAGGER_ENABLED') return false;
        return undefined;
      }),
    };

    setupSwagger(mockApp as INestApplication, mockConfig as ConfigService);

    expect(SwaggerModule.setup).not.toHaveBeenCalled();
    expect(SwaggerModule.createDocument).not.toHaveBeenCalled();
  });
});
