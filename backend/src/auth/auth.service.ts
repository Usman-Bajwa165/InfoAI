// backend/src/auth/auth.service.ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  // Validate OAuth user: create or find in DB
  async validateOAuthUser(provider: string, profile: any) {
    const { id: providerId, displayName, emails, photos } = profile;
    const email = emails?.[0]?.value;
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          provider,
          providerId,
          email,
          name: displayName,
          avatar: photos?.[0]?.value,
        },
      });
    }

    const payload = { sub: user.id, email: user.email, name: user.name };
    const accessToken = this.jwtService.sign(payload);
    return { user, accessToken };
  }
}
