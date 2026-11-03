import { Global, Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary/cloudinary.service';
import { GeminiService } from './gemini/gemini.service';
import { GoogleOAuthService } from './google/google-oauth.service';
import { MailService } from './mail/mail.service';
import { PushService } from './push/push.service';
import { RealtimeEmitter } from './realtime/realtime-emitter.service';
import { StorageService } from './storage/storage.service';

/** Stateless clients for external services, shared by every process. */
@Global()
@Module({
  providers: [
    StorageService,
    GeminiService,
    GoogleOAuthService,
    CloudinaryService,
    MailService,
    PushService,
    RealtimeEmitter,
  ],
  exports: [
    StorageService,
    GeminiService,
    GoogleOAuthService,
    CloudinaryService,
    MailService,
    PushService,
    RealtimeEmitter,
  ],
})
export class InfraModule {}
