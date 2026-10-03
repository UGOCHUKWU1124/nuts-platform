import { Injectable, Logger } from '@nestjs/common';
import {
  circuitBreaker,
  CircuitState,
  ConsecutiveBreaker,
  handleAll,
  timeout,
  TimeoutStrategy,
  wrap,
} from 'cockatiel';

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  // Paystack Policy: 3 consecutive failures trips the breaker, reset after 10s
  private readonly paystackCircuit = circuitBreaker(handleAll, {
    halfOpenAfter: 10_000,
    breaker: new ConsecutiveBreaker(3),
  });
  private readonly paystackTimeout = timeout(8_000, TimeoutStrategy.Aggressive);
  private readonly paystackPolicy = wrap(
    this.paystackTimeout,
    this.paystackCircuit,
  );

  // SMTP Policy: 3 consecutive failures trips the breaker, reset after 30s
  private readonly smtpCircuit = circuitBreaker(handleAll, {
    halfOpenAfter: 30_000,
    breaker: new ConsecutiveBreaker(3),
  });
  private readonly smtpTimeout = timeout(10_000, TimeoutStrategy.Aggressive);
  private readonly smtpPolicy = wrap(this.smtpTimeout, this.smtpCircuit);

  // Cloudinary Policy: 3 consecutive failures trips the breaker, reset after 15s
  private readonly cloudinaryCircuit = circuitBreaker(handleAll, {
    halfOpenAfter: 15_000,
    breaker: new ConsecutiveBreaker(3),
  });
  private readonly cloudinaryTimeout = timeout(
    15_000,
    TimeoutStrategy.Aggressive,
  );
  private readonly cloudinaryPolicy = wrap(
    this.cloudinaryTimeout,
    this.cloudinaryCircuit,
  );

  constructor() {
    this.paystackCircuit.onBreak(() =>
      this.logger.error('CRITICAL: Paystack Circuit Breaker tripped OPEN!'),
    );
    this.paystackCircuit.onReset(() =>
      this.logger.log('Paystack Circuit Breaker RESET to CLOSED.'),
    );

    this.smtpCircuit.onBreak(() =>
      this.logger.error('CRITICAL: SMTP Email Circuit Breaker tripped OPEN!'),
    );
    this.smtpCircuit.onReset(() =>
      this.logger.log('SMTP Circuit Breaker RESET to CLOSED.'),
    );

    this.cloudinaryCircuit.onBreak(() =>
      this.logger.error('CRITICAL: Cloudinary Circuit Breaker tripped OPEN!'),
    );
    this.cloudinaryCircuit.onReset(() =>
      this.logger.log('Cloudinary Circuit Breaker RESET to CLOSED.'),
    );
  }

  public async executePaystack<T>(fn: () => Promise<T>): Promise<T> {
    return this.paystackPolicy.execute(fn);
  }

  public async executeSmtp<T>(fn: () => Promise<T>): Promise<T> {
    return this.smtpPolicy.execute(fn);
  }

  public async executeCloudinary<T>(fn: () => Promise<T>): Promise<T> {
    return this.cloudinaryPolicy.execute(fn);
  }

  public getStatus() {
    return {
      paystack:
        this.paystackCircuit.state === CircuitState.Closed ? 'CLOSED' : 'OPEN',
      smtp: this.smtpCircuit.state === CircuitState.Closed ? 'CLOSED' : 'OPEN',
      cloudinary:
        this.cloudinaryCircuit.state === CircuitState.Closed
          ? 'CLOSED'
          : 'OPEN',
    };
  }
}
