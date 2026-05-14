import { DynamicModule, Module } from '@nestjs/common';
import { ImportJobController } from './import-job.controller';
import { ImportJobQueryService } from './import-job-query.service';
import { ImportJobRunnerService } from './import-job-runner.service';
import { ImportPreviewService } from './import-preview.service';
import { ImportSubmitService } from './import-submit.service';
import { ImportTenantJobStateService } from './import-tenant-job-state.service';
import { ImportTemplateController } from './import-template.controller';
import { ImportTemplateService } from './import-template.service';
import { IMPORT_RUNTIME_MODE, type ImportRuntimeMode } from './import.constants';

@Module({})
export class ImportModule {
  // 按运行模式装配 import API 入口与后台 worker 所需 provider
  static register(runtimeMode: ImportRuntimeMode = 'api'): DynamicModule {
    return {
      module: ImportModule,
      controllers: runtimeMode === 'api' ? [ImportTemplateController, ImportJobController] : [],
      providers: [
        ImportJobQueryService,
        ImportPreviewService,
        ImportSubmitService,
        ImportTemplateService,
        ImportTenantJobStateService,
        ImportJobRunnerService,
        {
          provide: IMPORT_RUNTIME_MODE,
          useValue: runtimeMode,
        },
      ],
      exports: [ImportTemplateService, ImportJobRunnerService],
    };
  }
}
