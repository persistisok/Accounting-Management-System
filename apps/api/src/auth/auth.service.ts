import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { permissions: { select: { resource: true, level: true } } },
    });
    if (!user || user.status !== 'ACTIVE' || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码不正确');
    }
    const payload = {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      projectManagerId: user.projectManagerId,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        projectManagerId: user.projectManagerId,
        permissions: user.permissions,
      },
    };
  }
}
