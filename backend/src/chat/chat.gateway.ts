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

  // guest quota (in-memory) for dev - key is socket id
  private guestCounts = new Map<string, { count: number; lastReset: number }>();
  private GUEST_DAILY_LIMIT = 10;

  constructor(
    private aiService: AIService,
    private jwtService: JwtService,
    private prisma: PrismaService
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ?? client.handshake.query?.token;
      if (!token) {
        client.data.user = null;
        client.emit("init", {
          conversation: null,
          instructions: [],
          user: null,
        });
        this.logger.debug("Guest connected (no token).");
        return;
      }

      const payload: any = this.jwtService.verify(token);
      const userId = payload?.sub;
      if (!userId) throw new Error("Invalid token payload (no sub)");

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error("User not found");

      client.data.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      };

      // load latest conversation (include messages)
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

      // load user's saved instructions (list)
      const instructions = await this.prisma.userInstruction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, text: true },
      });

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
        instructions,
      });

      client.emit("auth_result", { success: true });

      this.logger.log(
        `Socket connected: user=${user.email} socket=${client.id}`
      );
    } catch (err: any) {
      this.logger.warn("Connection auth failed: " + String(err));
      client.data.user = null;
      client.emit("init", { conversation: null, instructions: [], user: null });
      client.emit("auth_result", {
        success: false,
        message: err?.message ?? "auth failed",
      });
    }
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Socket disconnected: ${client.id}`);
    if (this.guestCounts.has(client.id)) this.guestCounts.delete(client.id);
  }

  // allow authenticate after connect (used by frontend when token comes via redirect)
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

      client.data.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      };

      // (re)load conversation/messages & instructions
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

      const instructions = await this.prisma.userInstruction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, text: true },
      });

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
        instructions,
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

  // add a new instruction (persisted)
  @SubscribeMessage("add_instruction")
  async handleAddInstruction(client: Socket, text: string) {
    const user = client.data.user;
    if (!user) {
      client.emit("instruction_added", {
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    const created = await this.prisma.userInstruction.create({
      data: { userId: user.id, text },
      select: { id: true, text: true },
    });

    client.emit("instruction_added", { success: true, instruction: created });
  }

  // edit existing instruction
  @SubscribeMessage("edit_instruction")
  async handleEditInstruction(
    client: Socket,
    payload: { id: string; text: string }
  ) {
    const user = client.data.user;
    if (!user) {
      client.emit("instruction_updated", {
        success: false,
        message: "Not authenticated",
      });
      return;
    }
    try {
      const updated = await this.prisma.userInstruction.update({
        where: { id: payload.id },
        data: { text: payload.text },
        select: { id: true, text: true },
      });
      client.emit("instruction_updated", {
        success: true,
        instruction: updated,
      });
    } catch (err) {
      client.emit("instruction_updated", {
        success: false,
        message: "Update failed",
      });
    }
  }

  // delete instruction
  @SubscribeMessage("delete_instruction")
  async handleDeleteInstruction(client: Socket, id: string) {
    const user = client.data.user;
    if (!user) {
      client.emit("instruction_deleted", {
        success: false,
        message: "Not authenticated",
      });
      return;
    }
    try {
      await this.prisma.userInstruction.delete({ where: { id } });
      client.emit("instruction_deleted", { success: true, id });
    } catch (err) {
      client.emit("instruction_deleted", {
        success: false,
        message: "Delete failed",
      });
    }
  }

  // helper: fetch persisted instructions as array of {id, text}
  private async getUserInstructionList(userId: string) {
    const list = await this.prisma.userInstruction.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, text: true },
    });
    return list;
  }

  // main message handler
  @SubscribeMessage("send_prompt")
  async handleMessage(
    client: Socket,
    payload: { text: string; mode?: string }
  ) {
    const user = client.data.user;
    const text = payload?.text?.trim();
    const mode = payload?.mode ?? "general";

    if (!text) {
      client.emit("token", { token: "Error: Empty prompt" });
      return;
    }

    // Guest flow (enforced server-side quota)
    if (!user) {
      const now = Date.now();
      const record = this.guestCounts.get(client.id) ?? {
        count: 0,
        lastReset: now,
      };
      if (now - record.lastReset > 24 * 60 * 60 * 1000) {
        record.count = 0;
        record.lastReset = now;
      }
      if (record.count >= this.GUEST_DAILY_LIMIT) {
        client.emit("guest_quota", {
          remaining: 0,
          limit: this.GUEST_DAILY_LIMIT,
        });
        client.emit("token", {
          token: "Error: Guest daily quota reached. Please sign in.",
        });
        return;
      }
      record.count += 1;
      this.guestCounts.set(client.id, record);

      try {
        client.emit("thinking", { message: "AI is thinking..." });
        const aiResponse = await this.aiService.getResponse(text, mode, null); // guests: no persisted instructions
        const tokens = aiResponse.split(/\s+/).filter(Boolean);
        tokens.forEach((t, i) =>
          setTimeout(() => client.emit("token", { token: t }), i * 80)
        );
        setTimeout(
          () => client.emit("done", { success: true }),
          tokens.length * 80 + 50
        );
      } catch (err) {
        this.logger.error("Guest send_prompt error", err);
        client.emit("token", { token: "Error: Unable to fetch AI response" });
      }
      return;
    }

    // Authenticated user flow: persist user message, call AI with user's saved instructions, save assistant reply
    try {
      // get (or create) conversation
      let conversation = await this.prisma.conversation.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
      });
      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: { userId: user.id, title: "Main conversation" },
        });
      }

      // save user's message
      const savedUserMsg = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          userId: user.id,
          role: "user",
          content: text,
        },
      });

      // get persisted instructions list (array of {id,text})
      const instructionsList = await this.getUserInstructionList(user.id);
      const instructionTexts = instructionsList.map((i) => i.text);

      // --- NEW: load recent history messages (including the message we just saved)
      // keep small window to avoid extremely long prompts
      const MAX_HISTORY = 12; // tune if needed
      const recentMsgs = await this.prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
      });
      // take last MAX_HISTORY messages
      const historyWindow = recentMsgs.slice(-MAX_HISTORY).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      client.emit("thinking", { message: "AI is thinking..." });

      // PASS history to AI service (new 4th argument)
      const aiResponse = await this.aiService.getResponse(
        text,
        mode,
        instructionTexts,
        historyWindow
      );

      // stream tokens
      const tokens = aiResponse.split(/\s+/).filter(Boolean);
      tokens.forEach((t, i) =>
        setTimeout(() => client.emit("token", { token: t }), i * 80)
      );

      // save assistant response as single message
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          userId: user.id,
          role: "assistant",
          content: aiResponse,
        },
      });

      // update conversation timestamp
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      setTimeout(
        () => client.emit("done", { success: true }),
        tokens.length * 80 + 50
      );
    } catch (err) {
      this.logger.error("Error handling send_prompt", err);
      client.emit("token", { token: "Error: Unable to fetch AI response" });
    }
  }
}
