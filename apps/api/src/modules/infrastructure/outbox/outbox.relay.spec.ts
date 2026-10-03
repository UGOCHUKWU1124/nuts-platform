import { OutboxStatus } from '@prisma/client';
import { OutboxRelay } from './outbox.relay';

describe('OutboxRelay', () => {
  let relay: OutboxRelay;
  let mockPrisma: any;
  let mockRabbitMQ: any;

  beforeEach(() => {
    mockPrisma = {
      outboxEvent: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    mockRabbitMQ = {
      isAvailable: jest.fn(),
      publish: jest.fn(),
    };

    relay = new OutboxRelay(mockPrisma, mockRabbitMQ);
  });

  it('skips processing if RabbitMQ is not available', async () => {
    mockRabbitMQ.isAvailable.mockReturnValue(false);

    await relay.processOutboxEvents();

    expect(mockPrisma.outboxEvent.findMany).not.toHaveBeenCalled();
  });

  it('claims pending events and marks them PUBLISHED on successful queue dispatch', async () => {
    mockRabbitMQ.isAvailable.mockReturnValue(true);
    mockRabbitMQ.publish.mockResolvedValue(true);

    const pendingEvents = [
      {
        id: 'evt-1',
        eventType: 'order.created',
        payload: { orderId: 'ord-123' },
        attempts: 0,
      },
    ];

    mockPrisma.outboxEvent.findMany.mockResolvedValue(pendingEvents);
    mockPrisma.outboxEvent.update.mockResolvedValue({});

    await relay.processOutboxEvents();

    // 1. Marked as PROCESSING
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: OutboxStatus.PROCESSING },
    });

    // 2. Published to RabbitMQ
    expect(mockRabbitMQ.publish).toHaveBeenCalledWith('order.created', {
      orderId: 'ord-123',
    });

    // 3. Marked as PUBLISHED
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-1' },
        data: expect.objectContaining({ status: OutboxStatus.PUBLISHED }),
      }),
    );
  });

  it('increments attempts and marks FAILED when queue dispatch fails', async () => {
    mockRabbitMQ.isAvailable.mockReturnValue(true);
    mockRabbitMQ.publish.mockResolvedValue(false); // Publish failed

    const pendingEvents = [
      {
        id: 'evt-2',
        eventType: 'user.registered',
        payload: { userId: 'u-1' },
        attempts: 1,
      },
    ];

    mockPrisma.outboxEvent.findMany.mockResolvedValue(pendingEvents);
    mockPrisma.outboxEvent.update.mockResolvedValue({});

    await relay.processOutboxEvents();

    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-2' },
        data: expect.objectContaining({
          status: OutboxStatus.FAILED,
          attempts: { increment: 1 },
        }),
      }),
    );
  });
});
