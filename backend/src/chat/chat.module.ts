import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { AIService } from './ai.service';

@Module({
  providers: [ChatGateway, AIService],
})
export class ChatModule {}
