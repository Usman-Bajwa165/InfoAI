import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AIService } from './ai.service';
import { Injectable, Logger } from '@nestjs/common';

@WebSocketGateway({ cors: true })
@Injectable()
export class ChatGateway {
  @WebSocketServer()
  server!: Server;

  private logger = new Logger(ChatGateway.name);

  constructor(private aiService: AIService) {}

  @SubscribeMessage('set_instructions')
  handleSetInstructions(@ConnectedSocket() client: Socket, @MessageBody() instructions: string) {
    try {
      this.aiService.setUserInstructions(client.id, instructions);
      client.emit('instructions_set', { success: true, instructions });
    } catch (err) {
      this.logger.error('Failed to set instructions', err);
      client.emit('instructions_set', { success: false });
    }
  }

  @SubscribeMessage('clear_instructions')
  handleClearInstructions(@ConnectedSocket() client: Socket) {
    this.aiService.setUserInstructions(client.id, null);
    client.emit('instructions_cleared', { success: true });
  }

  @SubscribeMessage('send_prompt')
  async handleMessage(
    @MessageBody() payload: { text: string; mode?: string },
    @ConnectedSocket() client: Socket
  ) {
    const { text, mode } = payload;
    try {
      const aiResponse = await this.aiService.getResponse(text, client.id, mode);

      // If the AIService returned an Error:... string, emit it as a single token to user.
      if (typeof aiResponse === 'string' && aiResponse.startsWith('Error:')) {
        client.emit('token', { token: aiResponse });
        return;
      }

      const tokens = String(aiResponse).split(/\s+/).filter(Boolean);
      tokens.forEach((t, i) => {
        setTimeout(() => client.emit('token', { token: t }), i * 100);
      });
    } catch (err) {
      this.logger.error('Unexpected error in handleMessage', err);
      client.emit('token', { token: 'Error: Unable to fetch AI response' });
    }
  }
}
