import { Global, Module } from '@nestjs/common';
import { ImageUploadController } from '../controllers/image-upload.controller';
import { CloudinaryService } from '../services/cloudinary.service';
import { LocalStorageStrategy } from './strategies/local-storage.strategy';
import { StorageStrategy } from './upload.interface';

@Global()
@Module({
  imports: [],
  providers: [
    {
      provide: StorageStrategy,
      useClass: LocalStorageStrategy, // Production grade: easily swap this with S3StorageStrategy
    },
    CloudinaryService,
  ],
  controllers: [ImageUploadController],
  exports: [StorageStrategy, CloudinaryService],
})
export class UploadModule {}
