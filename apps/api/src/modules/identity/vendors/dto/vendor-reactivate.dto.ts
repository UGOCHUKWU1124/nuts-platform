import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { MaxPasswordBytes } from 'src/modules/shared/decorators/max-password-bytes.decorator';

export class VendorReactivateDto {
  @ApiProperty({ example: 'vendor@example.com' })
  @IsEmail()
  @IsNotEmpty()
  @MaxPasswordBytes()
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd!' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
