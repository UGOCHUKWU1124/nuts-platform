import { Module } from '@nestjs/common';
import { AnalyticsReportService } from './reports/analytics-report.service';
import { AnalyticsSnapshotService } from './snapshots/analytics-snapshot.service';

@Module({
  providers: [AnalyticsSnapshotService, AnalyticsReportService],
  exports: [AnalyticsSnapshotService, AnalyticsReportService],
})
export class AnalyticsModule {}
