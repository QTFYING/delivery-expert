import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { authConfig } from '../config/auth.config';
import { clearRefreshTokenCookie, extractBearerToken, getRefreshTokenFromCookie, setRefreshTokenCookie } from './auth-session.util';
import { AuthService } from './auth.service';
import { AuthMeResponseSwagger, LoginResponseSwagger, RefreshTokenResponseSwagger } from './auth.swagger';
import { CurrentUser, JwtPayload } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth - 鉴权中心')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(authConfig.KEY)
    private readonly authSettings: ConfigType<typeof authConfig>,
  ) {}

  // 创建登录会话并下发刷新令牌
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '用户身份登录 (Login)',
    description: 'OS运营端人员或租户员工登录系统，获取访问 Token。前台通过判断 tenantId 进行区分。',
  })
  @ApiOkResponse({ description: '登录成功，返回 accessToken 与用户信息', type: LoginResponseSwagger })
  @ApiUnauthorizedResponse({ description: '账号或密码错误' })
  async login(@Body() loginDto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.authService.login(loginDto);

    setRefreshTokenCookie(res, req, session.refreshToken, this.authSettings);

    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }

  // 使用刷新令牌续签当前会话
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '刷新令牌 (Refresh Token)',
    description: '当 accessToken 过期时，使用长效 refreshToken 换取新的凭证',
  })
  @ApiOkResponse({ description: '刷新成功', type: RefreshTokenResponseSwagger })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = getRefreshTokenFromCookie(req, this.authSettings);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh Token 已失效，请重新登录');
    }

    const session = await this.authService.refresh(refreshToken);
    setRefreshTokenCookie(res, req, session.refreshToken, this.authSettings);

    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
    };
  }

  // 返回当前登录用户资料与权限快照
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '获取当前用户信息 (Me)',
    description: '返回当前已登录用户的基本信息，用于前端初始化用户状态',
  })
  @ApiOkResponse({ description: '返回用户信息', type: AuthMeResponseSwagger })
  async me(@CurrentUser() currentUser: JwtPayload) {
    return this.authService.getMe(currentUser);
  }

  // 修改当前登录用户密码并清理旧会话
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '修改当前用户密码 (Change Password)',
    description: '当前登录用户修改自己的密码，成功后当前用户的旧会话全部失效',
  })
  @ApiOkResponse({ description: '修改成功', schema: { type: 'null' } })
  async changePassword(
    @CurrentUser() currentUser: JwtPayload,
    @Body() request: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    await this.authService.changePassword(currentUser, request);
    clearRefreshTokenCookie(res, req, this.authSettings);
    return null;
  }

  // 注销当前会话并清理刷新令牌
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '注销退出 (Logout)',
    description: '吊销当前会话的 refresh cookie；若请求中携带 accessToken，则一并加入黑名单',
  })
  @ApiOkResponse({ description: '注销成功', schema: { type: 'null' } })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const accessToken = extractBearerToken(req.headers.authorization);
    const refreshToken = getRefreshTokenFromCookie(req, this.authSettings) ?? undefined;
    await this.authService.logout(accessToken, refreshToken);
    clearRefreshTokenCookie(res, req, this.authSettings);
    return null;
  }
}
