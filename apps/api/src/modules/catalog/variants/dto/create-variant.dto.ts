import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class VariantOptionItemDto {
  @ApiProperty({
    description: 'Option name, for example size or color.',
    example: 'size',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'Option value, for example M or Black.',
    example: 'M',
  })
  @IsString()
  @IsNotEmpty()
  value!: string;
}

export class CreateVariantDto {
  @ApiProperty({
    description:
      'Variant options. Option names must be unique within the variant.',
    type: () => VariantOptionItemDto,
    isArray: true,
    example: [
      {
        name: 'size',
        value: 'M',
      },
      {
        name: 'color',
        value: 'Black',
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VariantOptionItemDto)
  options!: VariantOptionItemDto[];

  @ApiProperty({
    description: 'Initial stock quantity.',
    example: 5,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  stock!: number;

  @ApiPropertyOptional({
    description: 'Variant-specific image URLs.',
    type: String,
    isArray: true,
    example: ['https://cdn.example.com/variant-black-m.jpg'],
  })
  @IsOptional()
  @IsString({ each: true })
  images?: string[];
}
