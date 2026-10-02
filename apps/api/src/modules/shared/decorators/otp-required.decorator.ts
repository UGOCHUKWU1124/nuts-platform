import { SetMetadata } from '@nestjs/common';
import type { OtpPurpose } from 'src/modules/auth/otp/otp.service';

export const OTP_REQUIRED_KEY = 'otpRequired';

export const OtpRequired = (purpose: OtpPurpose = 'registration') =>
  SetMetadata(OTP_REQUIRED_KEY, purpose);
