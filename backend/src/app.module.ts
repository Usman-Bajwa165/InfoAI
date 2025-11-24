import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [AuthModule, ChatModule],
  providers: [PrismaService],
})
export class AppModule {}
