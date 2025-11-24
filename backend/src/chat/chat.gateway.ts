// backend/src/chat/chat.gateway.ts
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AIService } from "./ai.service";
import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma.service";

@WebSocketGateway({ cors: true })
@Injectable()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private logger = new Logger(ChatGateway.name);
  private guestCounts = new Map<string, { count: number; lastReset: number }>();
  private GUEST_DAILY_LIMIT = 10;

  constructor(
    private aiService: AIService,
    private jwtService: JwtService,
    private prisma: PrismaService
  ) {}

  // When client connects
  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ?? client.handshake.query?.token;
      if (!token) {
        // Guest connection: still allow but no persistence
        client.data.user = null;
        client.emit("init", {
          conversation: null,
          instructions: null,
          user: null,
        });
        this.logger.debug("Guest connected (no token).");
        return;
      }

      // verify token
      const payload: any = this.jwtService.verify(token);
      const userId = payload?.sub;
      if (!userId) throw new Error("Invalid token payload (no sub)");

      // load user
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error("User not found");

      client.data.user = { id: user.id, email: user.email, name: user.name };

      // load user's latest conversation (or create one)
      let conversation = await this.prisma.conversation.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            userId: user.id,
            title: "Main conversation",
          },
          include: { messages: true },
        });
      }

      // send initial data (user info, conversation messages, saved instructions)
      client.emit("init", {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
        },
        conversation: {
          id: conversation.id,
          title: conversation.title,
          messages: conversation.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          })),
        },
        instructions: user.instructions ?? null,
      });

      this.logger.log(
        `Socket connected: user=${user.email} socket=${client.id}`
      );
    } catch (err) {
      this.logger.warn("Connection auth failed: " + String(err));
      // allow guest anyway
      client.data.user = null;
      client.emit("init", {
        conversation: null,
        instructions: null,
        user: null,
      });
    }
  }

async handleDisconnect(client: Socket) {
  this.logger.log(`Socket disconnected: ${client.id}`);
  // cleanup guest counts
  if (this.guestCounts.has(client.id)) {
    this.guestCounts.delete(client.id);
  }
}

  // Save / set persistent instructions on user record
  @SubscribeMessage("set_instructions")
  async handleSetInstructions(client: Socket, payload: string) {
    const user = client.data.user;
    if (!user) {
      client.emit("instructions_set", {
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { instructions: payload || null },
    });

    client.emit("instructions_set", {
      success: true,
      instructions: payload || null,
    });
  }

  @SubscribeMessage("clear_instructions")
  async handleClearInstructions(client: Socket) {
    const user = client.data.user;
    if (!user) {
      client.emit("instructions_cleared", {
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { instructions: null },
    });

    client.emit("instructions_cleared", { success: true });
  }

  // Main message handler: persist user message and assistant response
  @SubscribeMessage("send_prompt")
  async handleMessage(
    client: Socket,
    payload: { text: string; mode?: string }
  ) {
    // inside @SubscribeMessage('send_prompt') handler, near the start
    const user = client.data.user;
    const text = payload.text?.trim();
    const mode = payload.mode;
    if (!user) {
      // Guest flow with simple in-memory daily quota keyed by socket id
      const now = Date.now();
      const record = this.guestCounts.get(client.id) ?? {
        count: 0,
        lastReset: now,
      };
      // reset daily if >24h since lastReset
      if (now - record.lastReset > 24 * 60 * 60 * 1000) {
        record.count = 0;
        record.lastReset = now;
      }

      if (record.count >= this.GUEST_DAILY_LIMIT) {
        // tell client quota reached
        client.emit("guest_quota", {
          remaining: 0,
          limit: this.GUEST_DAILY_LIMIT,
        });
        client.emit("token", {
          token: "Error: Guest daily quota reached. Please sign in.",
        });
        return;
      }

      // increment and store
      record.count += 1;
      this.guestCounts.set(client.id, record);

      try {
        client.emit("thinking", { message: "AI is thinking..." });
        const aiResponse = await this.aiService.getResponse(
          text,
          mode ?? "general",
          "null"
        );

        const tokens = aiResponse.split(/\s+/).filter(Boolean);
        tokens.forEach((t, i) => {
          setTimeout(() => client.emit("token", { token: t }), i * 80);
        });

        setTimeout(
          () => client.emit("done", { success: true }),
          tokens.length * 80 + 50
        );
      } catch (err) {
        this.logger.error("Guest send_prompt error", err);
        client.emit("token", { token: "Error: Unable to fetch AI response" });
      }

      return; // done for guest path
    }

    if (!text) {
      client.emit("token", { token: "Error: Empty prompt" });
      return;
    }

    try {
      // ensure conversation exists (get latest)
      let conversation = await this.prisma.conversation.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
      });
      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: { userId: user.id, title: "Main conversation" },
        });
      }

      // Save user's message into DB
      const userMessage = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          userId: user.id,
          role: "user",
          content: text,
        },
      });

      // notify client that AI processing started
      client.emit("thinking", { message: "AI is thinking..." });

      // call AI service
      const aiResponse = await this.aiService.getResponse(
        text,
        mode ?? "general",
        await this.getUserInstructions(user.id)
      );

      // when aiResponse arrives, stream tokens and save the whole response to DB
      const tokens = aiResponse.split(/\s+/).filter(Boolean);

      // stream tokens
      tokens.forEach((t, i) => {
        setTimeout(() => client.emit("token", { token: t }), i * 80);
      });

      // Save assistant message as single full message
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          userId: user.id,
          role: "assistant",
          content: aiResponse,
        },
      });

      // update conversation updatedAt
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      // notify done
      setTimeout(
        () => client.emit("done", { success: true }),
        tokens.length * 80 + 50
      );
    } catch (err) {
      this.logger.error("Error handling send_prompt", err);
      client.emit("token", { token: "Error: Unable to fetch AI response" });
    }
  }

  private async getUserInstructions(
    userId: string
  ): Promise<string | undefined> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { instructions: true },
    });
    return u?.instructions ?? undefined;
  }

  // inside ChatGateway class (after existing methods)

  @SubscribeMessage("authenticate")
  async handleAuthenticate(client: Socket, token: string) {
    try {
      if (!token) {
        client.emit("auth_result", {
          success: false,
          message: "No token provided",
        });
        return;
      }

      const payload: any = this.jwtService.verify(token);
      const userId = payload?.sub;
      if (!userId) {
        client.emit("auth_result", {
          success: false,
          message: "Invalid token (no sub)",
        });
        return;
      }

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        client.emit("auth_result", {
          success: false,
          message: "User not found",
        });
        return;
      }

      // attach user to socket
      client.data.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      };

      // (re)load latest conversation and messages, same as in handleConnection
      let conversation = await this.prisma.conversation.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: { userId: user.id, title: "Main conversation" },
          include: { messages: true },
        });
      }

      client.emit("init", {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
        },
        conversation: {
          id: conversation.id,
          title: conversation.title,
          messages: conversation.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          })),
        },
        instructions: user.instructions ?? null,
      });

      client.emit("auth_result", { success: true });
      this.logger.log(
        `Socket authenticated: user=${user.email} socket=${client.id}`
      );
    } catch (err: any) {
      this.logger.warn("Authenticate failed: " + String(err));
      client.emit("auth_result", {
        success: false,
        message: err?.message ?? "auth failed",
      });
    }
  }
}
