import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { CompleteUploadResponse, UploadPolicyResponse } from '@shou/types/contracts';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateUploadPolicyDto } from './dto/create-upload-policy.dto';
import { UploadService } from './upload.service';
import { CompleteUploadResponseSwagger, UploadPolicyResponseSwagger } from './upload.swagger';

@ApiTags('Uploads - 通用上传中心')
@ApiBearerAuth()
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  // 按上传场景签发 OSS 直传凭证 当前仅开放用户头像
  @Post('policies')
  @ApiOperation({ summary: '申请 OSS 直传凭证' })
  @ApiOkResponse({ description: '返回 OSS POST 直传所需字段', type: UploadPolicyResponseSwagger })
  async createPolicy(@CurrentUser() currentUser: JwtPayload, @Body() request: CreateUploadPolicyDto): Promise<UploadPolicyResponse> {
    return this.uploadService.createPolicy(currentUser, request);
  }

  // 确认当前上传记录对应的 OSS 对象已经直传完成
  @Post(':uploadId/complete')
  @ApiOperation({ summary: '确认上传完成' })
  @ApiParam({ name: 'uploadId', description: '上传记录 ID' })
  @ApiOkResponse({ description: '上传对象已确认存在', type: CompleteUploadResponseSwagger })
  async completeUpload(@CurrentUser() currentUser: JwtPayload, @Param('uploadId') uploadId: string): Promise<CompleteUploadResponse> {
    return this.uploadService.completeUpload(currentUser, uploadId);
  }
}
