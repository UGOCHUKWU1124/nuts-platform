import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import './load-env';

const dsn = process.env.SENTRY_DSN;

// Respect explicitly configured SENTRY_ENVIRONMENT, falling back to active NODE_ENV
const environment =
  process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';

const isProduction = environment === 'production';

function parseSampleRate(value: string | undefined, fallback: number): number {
  if (value !== undefined && value !== '') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return fallback;
}

// In production, default to 10% sampling to protect performance and avoid quota starvation.
// In non-production (development, staging, test), default to 100% for full visibility.
// Always overrideable via SENTRY_TRACES_SAMPLE_RATE / SENTRY_PROFILES_SAMPLE_RATE.
const tracesSampleRate = parseSampleRate(
  process.env.SENTRY_TRACES_SAMPLE_RATE,
  isProduction ? 0.1 : 1.0,
);

const profileSessionSampleRate = parseSampleRate(
  process.env.SENTRY_PROFILES_SAMPLE_RATE,
  isProduction ? 0.1 : 1.0,
);

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    enabled: true,
    beforeSend(event) {
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.url) {
          try {
            const url = new URL(event.request.url);
            event.request.url = `${url.origin}${url.pathname}`;
          } catch {
            delete event.request.url;
          }
        }
      }
      delete event.user;
      return event;
    },
    beforeSendTransaction(event) {
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.url) {
          try {
            const url = new URL(event.request.url);
            event.request.url = `${url.origin}${url.pathname}`;
          } catch {
            delete event.request.url;
          }
        }
      }
      delete event.user;
      return event;
    },
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate,
    profileSessionSampleRate,
    profileLifecycle: 'trace',
    release: process.env.SENTRY_RELEASE || process.env.npm_package_version,
  });
}
