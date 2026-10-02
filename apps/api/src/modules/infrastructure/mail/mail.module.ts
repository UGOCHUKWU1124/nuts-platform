import { Global, Module } from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import { EmailService } from './email.service';
import { NodemailerProvider } from './mail.provider';

@Global()
@Module({
  providers: [
    {
      provide: 'EMAIL_PROVIDER',
      useClass: NodemailerProvider,
    },
    {
      provide: 'MAIL_PROVIDER',
      useExisting: 'EMAIL_PROVIDER',
    },
    EmailService,
    EmailTemplatesService,
  ],
  exports: [
    'EMAIL_PROVIDER',
    'MAIL_PROVIDER',
    EmailService,
    EmailTemplatesService,
  ],
})
export class MailModule {}
