import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '@api/modules/shared/decorators/public.decorator';
import { PaymentsService } from './payments.service';

import { RefundPaymentDto, RequestPaymentOtpDto } from './dto';

import {
  InitializePaymentResponseDto,
  PaymentResponseDto,
} from './dto/payment-response.dto';

import { ROLE } from '@prisma/client';
import { OtpService } from '@api/modules/auth/otp/otp.service';
import { OtpThrottle } from '@api/modules/shared/decorators/custom-throttler.decorator';
import { GetUser } from '@api/modules/shared/decorators/get-user.decorator';
import { OtpRequired } from '@api/modules/shared/decorators/otp-required.decorator';
import { Roles } from '@api/modules/shared/decorators/role.decorator';
import { JwtAuthGuard } from '@api/modules/shared/guards/jwt-auth.guard';
import { RolesGuard } from '@api/modules/shared/guards/roles.guard';

@ApiTags('Payments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['payment', 'payments'])
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly otpService: OtpService,
  ) {}

  // ---------------------------------------------------------------------------
  // PAYMENT OTP
  // ---------------------------------------------------------------------------

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @OtpThrottle()
  @UseGuards(JwtAuthGuard)
  @Roles(ROLE.USER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request OTP for payment',
  })
  @ApiQuery({
    name: 'orderId',
    required: true,
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.OK,
  })
  async requestPaymentOtp(
    @GetUser('id') userId: string,
    @GetUser('email') userEmail: string,
    @Query()
    query: RequestPaymentOtpDto,
  ) {
    /**
     * If orderId exists, validate that the payment belongs to the user
     * before generating the OTP context.
     */
    if (query.orderId) {
      const context = await this.paymentsService.getPaymentOtpContext(
        userId,
        query.orderId,
      );

      await this.otpService.createOtp(userEmail, 'payment', {
        subject: `Payment Authorization OTP for Order #${context.orderNumber}`,
        orderDetails: `Order #${context.orderNumber} - ${context.currency} ${context.amount}`,
      });

      return {
        message: 'Payment verification code sent to your email.',
        ...context,
      };
    }

    return {
      message: 'Payment OTP context requires an orderId.',
    };
  }

  // ---------------------------------------------------------------------------
  // INITIALIZE
  // ---------------------------------------------------------------------------

  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Roles(ROLE.USER)
  @OtpRequired('payment')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Initialize Paystack payment for an order',
  })
  @ApiQuery({
    name: 'orderId',
    required: true,
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: InitializePaymentResponseDto,
  })
  async initialize(
    @GetUser('id') userId: string,
    @Query(
      'orderId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    orderId: string,
  ): Promise<InitializePaymentResponseDto> {
    return this.paymentsService.initializeForOrder(userId, orderId);
  }

  // ---------------------------------------------------------------------------
  // FIND PAYMENT
  // ---------------------------------------------------------------------------

  @Get('order/:orderId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Roles(ROLE.USER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get payment for an order',
  })
  @ApiParam({
    name: 'orderId',
    description: 'Order UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentResponseDto,
  })
  async findByOrder(
    @GetUser('id') userId: string,
    @Param(
      'orderId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    orderId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.findByOrder(userId, orderId);
  }

  // ---------------------------------------------------------------------------
  // PAYSTACK CALLBACK
  // ---------------------------------------------------------------------------

  @Get('callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paystack payment callback',
  })
  @ApiQuery({
    name: 'reference',
    required: false,
    type: String,
  })
  @ApiQuery({
    name: 'trxref',
    required: false,
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentResponseDto,
  })
  async verifyCallback(
    @Query('reference')
    reference?: string,
    @Query('trxref')
    trxref?: string,
  ): Promise<PaymentResponseDto> {
    const paymentReference = reference?.trim() || trxref?.trim();

    if (!paymentReference) {
      throw new BadRequestException('Payment reference is required.');
    }

    return this.paymentsService.verifyByReference(paymentReference);
  }

  // ---------------------------------------------------------------------------
  // WEBHOOK
  // ---------------------------------------------------------------------------

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paystack webhook',
  })
  @ApiHeader({
    name: 'x-paystack-signature',
    required: true,
  })
  async webhook(
    @Req()
    req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature')
    signature?: string,
  ): Promise<{
    received: true;
  }> {
    /**
     * Paystack signature verification requires the EXACT raw request body.
     *
     * Do not JSON.stringify(req.body) here.
     */
    const rawBody = req.rawBody;

    if (!rawBody) {
      throw new BadRequestException(
        'Raw request body is required for Paystack webhook verification.',
      );
    }

    await this.paymentsService.handleWebhook(
      rawBody.toString('utf8'),
      signature,
    );

    /**
     * Return 200 so Paystack knows the webhook was received.
     */
    return {
      received: true,
    };
  }

  // ---------------------------------------------------------------------------
  // ADMIN REFUND
  // ---------------------------------------------------------------------------

  @Post('refund')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(ROLE.ADMIN)
  @ApiOperation({
    summary: 'Refund a successful payment',
  })
  @ApiBody({
    type: RefundPaymentDto,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentResponseDto,
  })
  async refund(
    @GetUser('id') adminId: string,
    @Body()
    dto: RefundPaymentDto,
  ): Promise<PaymentResponseDto> {
    /**
     * The service currently supports full refunds only because the current
     * Payment schema has no refund ledger/refundedAmount field.
     */
    return this.paymentsService.refund(dto.paymentId, adminId, dto.amount);
  }
}
