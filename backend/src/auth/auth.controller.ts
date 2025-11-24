// backend/src/auth/auth.controller.ts
import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  // Google OAuth login redirect
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth(): void {
    // Passport handles redirect
  }

  // Google OAuth callback
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleAuthRedirect(@Req() req: any, @Res() res: any): void {
    const { accessToken } = (req.user as any) ?? {};
    res.redirect(`http://localhost:3001/chat?token=${accessToken ?? ''}`);
  }

  // GitHub OAuth login redirect
  @Get('github')
  @UseGuards(AuthGuard('github'))
  githubAuth(): void {
    // Passport handles redirect
  }

  // GitHub OAuth callback
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  githubAuthRedirect(@Req() req: any, @Res() res: any): void {
    const { accessToken } = (req.user as any) ?? {};
    res.redirect(`http://localhost:3001/chat?token=${accessToken ?? ''}`);
  }
}
