import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@api/modules/infrastructure/prisma/prisma.service';
import { Public } from '@api/modules/shared/decorators/public.decorator';

@ApiTags('HEALTH')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Health check (liveness)',
    description:
      'Simple liveness probe that returns OK if the service is running.',
  })
  liveness(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness check (database)',
    description:
      'Readiness probe that verifies the database connection is healthy.',
  })
  @ApiResponse({
    status: 503,
    description: 'Database connection failed',
  })
  async readiness(): Promise<{
    status: string;
    database: string;
    timestamp: string;
  }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database readiness check failed.');
    }

    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
