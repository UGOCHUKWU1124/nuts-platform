import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  NotificationPriority,
  NotificationType,
  Prisma,
  ROLE,
} from '@prisma/client';
import {
  EmailOrderItem,
  EmailTemplatesService,
} from '@api/modules/infrastructure/mail/email-templates.service';
import { PrismaService } from '@api/modules/infrastructure/prisma/prisma.service';
import { RABBITMQ_QUEUES } from '@api/modules/infrastructure/rabbitmq/rabbitmq.constants';
import { RabbitMQService } from '@api/modules/infrastructure/rabbitmq/rabbitmq.service';
import { DomainEvents } from '@api/modules/shared/events/domain-events';
import type {
  OrderCancelledPayload,
  OrderDeliveredPayload,
  OrderProcessingPayload,
  OrderShippedPayload,
  PaymentConfirmedPayload,
  PaymentFailedPayload,
  ReferralRewardCreditedPayload,
} from '@api/modules/shared/events/event-payloads';

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly emailTemplates: EmailTemplatesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Dispatches in-app notification to RabbitMQ, with seamless fallback to direct
   * PostgreSQL persistence if RabbitMQ is disabled or unavailable.
   */
  private async dispatchNotification(data: {
    userId: string;
    role: ROLE;
    type: NotificationType;
    title: string;
    message: string;
    priority: NotificationPriority;
    link?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const published = await this.rabbitmq.publish(
      RABBITMQ_QUEUES.NOTIFICATIONS,
      data,
    );
    if (!published) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: data.userId,
            role: data.role,
            type: data.type,
            title: data.title,
            message: data.message,
            priority: data.priority,
            actionUrl: data.link ?? null,
            metadata: (data.metadata as Prisma.InputJsonValue) ?? Prisma.DbNull,
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to persist in-app notification directly for user ${data.userId}`,
          error,
        );
      }
    }
  }

  private formatVariantOptions(
    options: unknown,
  ): { name: string; value: string }[] | undefined {
    if (!options) return undefined;
    if (Array.isArray(options)) {
      return options as { name: string; value: string }[];
    }
    if (typeof options === 'object' && options !== null) {
      return Object.entries(options as Record<string, string>).map(
        ([name, value]) => ({ name, value }),
      );
    }
    return undefined;
  }

  @OnEvent(DomainEvents.ORDER_PROCESSING)
  async handleOrderProcessing(payload: OrderProcessingPayload): Promise<void> {
    this.logger.log(
      { orderId: payload.orderId },
      'Order processing event received',
    );

    // 1. Email to customer
    const items: EmailOrderItem[] = payload.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      variantOptions: item.variantOptions,
    }));

    const customerHtml = this.emailTemplates.orderConfirmation({
      orderNumber: payload.orderNumber,
      customerName: payload.userFirstName || 'Valued Customer',
      items,
      totalAmount: payload.totalAmount,
      discountAmount: 0,
      finalAmount: payload.finalAmount,
      currency: payload.currency,
      shippingAddress: payload.shippingAddress,
    });

    await this.rabbitmq.publish(RABBITMQ_QUEUES.EMAILS, {
      to: payload.userEmail,
      subject: `Order Confirmation - ${payload.orderNumber}`,
      html: customerHtml,
      type: 'order_confirmation',
      metadata: { orderId: payload.orderId },
    });

    // In-app notification to customer
    await this.dispatchNotification({
      userId: payload.userId,
      role: ROLE.USER,
      type: NotificationType.ORDER_CONFIRMED,
      title: 'Order Confirmed',
      message: `Your order #${payload.orderNumber} is now processing.`,
      priority: NotificationPriority.HIGH,
      link: `/account/orders`,
      metadata: { orderId: payload.orderId },
    });

    // 2. Fetch order items for per-vendor notifications
    const orderItems = await this.prisma.orderItem.findMany({
      where: { orderId: payload.orderId },
      include: {
        product: { select: { name: true } },
        variant: { select: { options: true } },
        vendor: { select: { id: true, email: true, storeName: true } },
      },
    });

    if (!orderItems || orderItems.length === 0) return;

    const vendorItemsMap = new Map<string, typeof orderItems>();
    for (const item of orderItems) {
      const existing = vendorItemsMap.get(item.vendorId) || [];
      existing.push(item);
      vendorItemsMap.set(item.vendorId, existing);
    }

    for (const [, vendorItems] of vendorItemsMap) {
      const vendor = vendorItems[0].vendor;
      const vendorTotal = vendorItems.reduce(
        (sum: number, i) => sum + Number(i.totalPrice),
        0,
      );

      const vendorOrderItems: EmailOrderItem[] = vendorItems.map((item) => ({
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        variantOptions: item.variant
          ? this.formatVariantOptions(item.variant.options)
          : undefined,
      }));

      const vendorHtml = this.emailTemplates.newOrderForVendor({
        vendorStoreName: vendor.storeName,
        orderNumber: payload.orderNumber,
        customerName: payload.userFirstName || 'Customer',
        items: vendorOrderItems,
        totalAmount: vendorTotal,
        orderTotalForVendor: vendorTotal,
        currency: payload.currency,
      });

      await this.rabbitmq.publish(RABBITMQ_QUEUES.EMAILS, {
        to: vendor.email,
        subject: `New Order Received - ${payload.orderNumber}`,
        html: vendorHtml,
        type: 'vendor_new_order',
        metadata: { orderId: payload.orderId, vendorId: vendor.id },
      });

      await this.dispatchNotification({
        userId: vendor.id,
        role: ROLE.VENDOR,
        type: NotificationType.ORDER_CONFIRMED,
        title: 'New Order Received!',
        message: `You have a new sale for order #${payload.orderNumber}.`,
        priority: NotificationPriority.HIGH,
        link: `/vendor/orders`,
        metadata: { orderId: payload.orderId },
      });
    }
  }

  @OnEvent(DomainEvents.ORDER_SHIPPED)
  async handleOrderShipped(payload: OrderShippedPayload): Promise<void> {
    this.logger.log(
      { orderId: payload.orderId },
      'Order shipped event received',
    );

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      include: {
        orderItems: {
          include: {
            product: { select: { name: true } },
            variant: { select: { options: true } },
          },
        },
      },
    });

    if (!order) return;

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: payload.orderId },
      select: { currency: true },
    });

    const items: EmailOrderItem[] = order.orderItems.map((item) => ({
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      variantOptions: item.variant
        ? this.formatVariantOptions(item.variant.options)
        : undefined,
    }));

    const html = this.emailTemplates.orderShipped({
      orderNumber: payload.orderNumber,
      customerName: payload.userFirstName || 'Valued Customer',
      items,
      trackingNumber: payload.trackingNumber,
      shippingAddress: order.shippingAddress || '',
      currency: payment?.currency || 'NGN',
    });

    await this.rabbitmq.publish(RABBITMQ_QUEUES.EMAILS, {
      to: payload.userEmail,
      subject: `Your Order #${payload.orderNumber} Has Shipped!`,
      html,
      type: 'order_shipped',
      metadata: { orderId: payload.orderId },
    });

    await this.dispatchNotification({
      userId: payload.userId,
      role: ROLE.USER,
      type: NotificationType.ORDER_SHIPPED,
      title: 'Order Shipped',
      message: `Your order #${payload.orderNumber} is on the way!`,
      priority: NotificationPriority.HIGH,
      link: `/account/orders`,
      metadata: { orderId: payload.orderId },
    });
  }

  @OnEvent(DomainEvents.ORDER_DELIVERED)
  async handleOrderDelivered(payload: OrderDeliveredPayload): Promise<void> {
    this.logger.log(
      { orderId: payload.orderId },
      'Order delivered event received',
    );

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      include: {
        orderItems: {
          include: {
            product: { select: { name: true } },
            variant: { select: { options: true } },
          },
        },
      },
    });

    if (!order) return;

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: payload.orderId },
      select: { currency: true },
    });

    const items: EmailOrderItem[] = order.orderItems.map((item) => ({
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      variantOptions: item.variant
        ? this.formatVariantOptions(item.variant.options)
        : undefined,
    }));

    const html = this.emailTemplates.orderDelivered({
      orderNumber: payload.orderNumber,
      customerName: payload.userFirstName || 'Valued Customer',
      items,
      currency: payment?.currency || 'NGN',
    });

    await this.rabbitmq.publish(RABBITMQ_QUEUES.EMAILS, {
      to: payload.userEmail,
      subject: `Order Delivered - ${payload.orderNumber}`,
      html,
      type: 'order_delivered',
      metadata: { orderId: payload.orderId },
    });

    await this.dispatchNotification({
      userId: payload.userId,
      role: ROLE.USER,
      type: NotificationType.ORDER_DELIVERED,
      title: 'Order Delivered',
      message: `Your order #${payload.orderNumber} has arrived!`,
      priority: NotificationPriority.HIGH,
      link: `/account/orders`,
      metadata: { orderId: payload.orderId },
    });
  }

  @OnEvent(DomainEvents.ORDER_CANCELLED)
  async handleOrderCancelled(payload: OrderCancelledPayload): Promise<void> {
    this.logger.log(
      { orderId: payload.orderId },
      'Order cancelled event received',
    );

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      include: {
        orderItems: {
          include: {
            product: { select: { name: true } },
            variant: { select: { options: true } },
          },
        },
      },
    });

    if (!order) return;

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: payload.orderId },
      select: { currency: true },
    });

    const items: EmailOrderItem[] = order.orderItems.map((item) => ({
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      variantOptions: item.variant
        ? this.formatVariantOptions(item.variant.options)
        : undefined,
    }));

    const html = this.emailTemplates.orderCancelled({
      orderNumber: payload.orderNumber,
      customerName: payload.userFirstName || 'Valued Customer',
      items,
      reason: payload.reason,
      refundProcessed: payload.refundProcessed,
      currency: payment?.currency || 'NGN',
    });

    await this.rabbitmq.publish(RABBITMQ_QUEUES.EMAILS, {
      to: payload.userEmail,
      subject: `Order #${payload.orderNumber} Cancelled`,
      html,
      type: 'order_cancelled',
      metadata: { orderId: payload.orderId },
    });

    await this.dispatchNotification({
      userId: payload.userId,
      role: ROLE.USER,
      type: NotificationType.ORDER_CANCELLED,
      title: 'Order Cancelled',
      message: `Your order #${payload.orderNumber} has been cancelled.`,
      priority: NotificationPriority.HIGH,
      link: `/account/orders`,
      metadata: { orderId: payload.orderId },
    });
  }

  @OnEvent(DomainEvents.PAYMENT_CONFIRMED)
  async handlePaymentConfirmed(
    payload: PaymentConfirmedPayload,
  ): Promise<void> {
    this.logger.log(
      { paymentId: payload.paymentId },
      'Payment confirmed event received',
    );

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      include: {
        orderItems: {
          include: {
            product: { select: { name: true } },
            variant: { select: { options: true } },
          },
        },
      },
    });

    if (!order) return;

    const items: EmailOrderItem[] = order.orderItems.map((item) => ({
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      variantOptions: item.variant
        ? this.formatVariantOptions(item.variant.options)
        : undefined,
    }));

    const html = this.emailTemplates.paymentConfirmed({
      orderNumber: payload.orderNumber,
      customerName: payload.userFirstName || 'Valued Customer',
      items,
      amount: payload.amount,
      currency: payload.currency,
      paymentReference: payload.paymentReference,
    });

    await this.rabbitmq.publish(RABBITMQ_QUEUES.EMAILS, {
      to: payload.userEmail,
      subject: `Payment Confirmed - Order #${payload.orderNumber}`,
      html,
      type: 'payment_confirmed',
      metadata: { paymentId: payload.paymentId, orderId: payload.orderId },
    });

    await this.dispatchNotification({
      userId: payload.userId,
      role: ROLE.USER,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Payment Successful',
      message: `Payment of ${payload.currency} ${payload.amount} confirmed for order #${payload.orderNumber}.`,
      priority: NotificationPriority.HIGH,
      link: `/account/orders`,
      metadata: { paymentId: payload.paymentId, orderId: payload.orderId },
    });
  }

  @OnEvent(DomainEvents.PAYMENT_FAILED)
  async handlePaymentFailed(payload: PaymentFailedPayload): Promise<void> {
    this.logger.log(
      { paymentId: payload.paymentId },
      'Payment failed event received',
    );

    const html = this.emailTemplates.paymentFailed({
      orderNumber: payload.orderNumber,
      customerName: payload.userFirstName || 'Valued Customer',
      reason: payload.reason,
    });

    await this.rabbitmq.publish(RABBITMQ_QUEUES.EMAILS, {
      to: payload.userEmail,
      subject: `Payment Failed - Order #${payload.orderNumber}`,
      html,
      type: 'payment_failed',
      metadata: { paymentId: payload.paymentId },
    });

    await this.dispatchNotification({
      userId: payload.userId,
      role: ROLE.USER,
      type: NotificationType.PAYMENT_FAILED,
      title: 'Payment Failed',
      message: `Payment failed for order #${payload.orderNumber}: ${payload.reason || 'Check details and try again.'}`,
      priority: NotificationPriority.HIGH,
      link: `/checkout`,
      metadata: { paymentId: payload.paymentId, orderId: payload.orderId },
    });
  }

  @OnEvent(DomainEvents.REFERRAL_REWARD_CREDITED)
  async handleReferralReward(
    payload: ReferralRewardCreditedPayload,
  ): Promise<void> {
    this.logger.log(
      { referralId: payload.referralId },
      'Referral reward event received',
    );

    const html = this.emailTemplates.referralRewardCredited({
      referrerName: payload.referrerName,
      rewardAmount: payload.rewardAmount,
      currency: 'NGN',
    });

    await this.rabbitmq.publish(RABBITMQ_QUEUES.EMAILS, {
      to: payload.referrerEmail,
      subject: 'You Earned a Referral Reward!',
      html,
      type: 'referral_reward',
      metadata: { referralId: payload.referralId },
    });

    await this.rabbitmq.publish(RABBITMQ_QUEUES.NOTIFICATIONS, {
      userId: payload.referrerId,
      role: ROLE.USER,
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      title: 'Referral Reward Earned!',
      message: `You earned NGN ${payload.rewardAmount} from a referral!`,
      priority: NotificationPriority.MEDIUM,
      link: `/account/wallet`,
      metadata: { referralId: payload.referralId },
    });
  }
}
