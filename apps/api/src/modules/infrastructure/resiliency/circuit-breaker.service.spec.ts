import { BrokenCircuitError } from 'cockatiel';
import { CircuitBreakerService } from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = new CircuitBreakerService();
  });

  describe('Initial state', () => {
    it('initializes all circuits in CLOSED state', () => {
      const status = service.getStatus();
      expect(status.paystack).toBe('CLOSED');
      expect(status.smtp).toBe('CLOSED');
      expect(status.cloudinary).toBe('CLOSED');
    });
  });

  describe('executePaystack resilience', () => {
    it('executes successful calls normally', async () => {
      const result = await service.executePaystack(async () => 'paystack-ok');
      expect(result).toBe('paystack-ok');
      expect(service.getStatus().paystack).toBe('CLOSED');
    });

    it('trips the breaker OPEN after 3 consecutive failures and fails fast', async () => {
      const failingFn = jest.fn(async () => {
        throw new Error('Paystack gateway timeout');
      });

      // 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        await expect(service.executePaystack(failingFn)).rejects.toThrow('Paystack gateway timeout');
      }

      // Circuit should now be OPEN
      expect(service.getStatus().paystack).toBe('OPEN');

      // Subsequent call should fail fast with BrokenCircuitError without executing the function
      failingFn.mockClear();
      await expect(service.executePaystack(failingFn)).rejects.toThrow(BrokenCircuitError);
      expect(failingFn).not.toHaveBeenCalled();
    });
  });
});
