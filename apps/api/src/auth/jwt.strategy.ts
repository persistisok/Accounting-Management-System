import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'development-only-change-this-secret'),
    });
  }

  async validate(payload: { sub: string }): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, username: true, displayName: true, role: true, projectManagerId: true, status: true,
        permissions: { select: { resource: true, level: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('账号已停用');
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      projectManagerId: user.projectManagerId,
      permissions: user.permissions,
    };
  }
}
