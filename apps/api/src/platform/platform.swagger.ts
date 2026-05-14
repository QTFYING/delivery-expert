import { ApiProperty } from '@nestjs/swagger';
import type {
  ConsoleInfoResponse as ConsoleInfoResponseContract,
  DashboardMetricItem as DashboardMetricItemContract,
  LoginRiskEventItem as LoginRiskEventItemContract,
  PlatformOverviewGrowth as PlatformOverviewGrowthContract,
  PlatformOverviewResponse as PlatformOverviewResponseContract,
  PlatformRenewalRiskItem as PlatformRenewalRiskItemContract,
  PlatformTodoItem as PlatformTodoItemContract,
  TenantHealthItem as TenantHealthItemContract,
} from '@shou/types/contracts';

export class ConsoleInfoResponseSwagger implements ConsoleInfoResponseContract {
  @ApiProperty({ description: '产品名称', example: '收单吧' })
  productName!: string;

  @ApiProperty({ description: '套件名称', example: '平台运营后台' })
  suiteName!: string;

  @ApiProperty({ description: '当前作用域标签', example: '平台视角' })
  scopeLabel!: string;

  @ApiProperty({ description: '当前操作人姓名', example: '平台管理员A' })
  operator!: string;

  @ApiProperty({ description: '当前角色名称', example: 'OS_SUPER_ADMIN' })
  role!: string;

  @ApiProperty({ description: '当前租户名称，平台用户固定为破折号', example: '—' })
  currentTenant!: string;
}

export class DashboardMetricItemSwagger implements DashboardMetricItemContract {
  @ApiProperty({ description: '指标名称', example: '租户总数' })
  label!: string;

  @ApiProperty({ description: '指标值', example: '18 家' })
  value!: string;

  @ApiProperty({ description: '辅助说明', example: '活跃 15 家，待上线 2 家' })
  helper!: string;

  @ApiProperty({ description: '色调标识', example: 'blue' })
  tone!: string;
}

export class PlatformTodoItemSwagger implements PlatformTodoItemContract {
  @ApiProperty({ description: '待办标题', example: '资质审核待处理 3 条' })
  title!: string;

  @ApiProperty({ description: '详细描述', example: '存在待初审、待复核或待确认的资质申请' })
  detail!: string;

  @ApiProperty({ description: '负责人', example: '平台审核' })
  owner!: string;

  @ApiProperty({ description: '优先级标识', example: '高' })
  priority!: string;
}

export class TenantHealthItemSwagger implements TenantHealthItemContract {
  @ApiProperty({ description: '租户名称', example: '华南一区商户A' })
  tenant!: string;

  @ApiProperty({ description: '健康度百分比 0-100', example: 86 })
  health!: number;

  @ApiProperty({ description: '账号覆盖情况描述', example: '3/5 近30天活跃' })
  userCoverage!: string;

  @ApiProperty({ description: '异常提示', example: '距离到期 5 天' })
  exception!: string;

  @ApiProperty({ description: '负责人', example: '张三' })
  owner!: string;
}

export class LoginRiskEventItemSwagger implements LoginRiskEventItemContract {
  @ApiProperty({ description: '涉事账号', example: 'admin001' })
  account!: string;

  @ApiProperty({ description: '所属租户', example: '平台' })
  tenant!: string;

  @ApiProperty({ description: '风险事件描述', example: '账号处于锁定状态' })
  event!: string;

  @ApiProperty({ description: '发生时间', example: '2026-04-13T10:00:00.000Z' })
  time!: string;

  @ApiProperty({ description: '风险等级', example: '高' })
  level!: string;
}

export class PlatformOverviewGrowthSwagger implements PlatformOverviewGrowthContract {
  @ApiProperty({ description: '本月新增租户数', example: 5 })
  newTenants!: number;

  @ApiProperty({ description: '本月新增后已进入活跃态的租户数', example: 3 })
  trialToFormal!: number;

  @ApiProperty({ description: '流失预警数', example: 4 })
  churnWarning!: number;

  @ApiProperty({ description: '近 7 日每日新增租户数', type: [Number], example: [0, 1, 0, 2, 1, 0, 1] })
  dailyTrend!: number[];
}

export class PlatformRenewalRiskItemSwagger implements PlatformRenewalRiskItemContract {
  @ApiProperty({ description: '租户名称', example: '华南一区商户A' })
  tenantName!: string;

  @ApiProperty({ description: '由租户服务到期时间派生的距到期天数', example: 5 })
  dueInDays!: number;

  @ApiProperty({ description: '负责人', example: '张三' })
  owner!: string;
}

export class PlatformOverviewResponseSwagger implements PlatformOverviewResponseContract {
  @ApiProperty({ description: '平台总流水（元）', example: 128000.5 })
  totalFlow!: number;

  @ApiProperty({ description: '租户总数', example: 18 })
  totalTenants!: number;

  @ApiProperty({ description: '本月新增租户数', example: 5 })
  newTenantsThisMonth!: number;

  @ApiProperty({ description: '平台健康度', example: 82 })
  healthScore!: number;

  @ApiProperty({ description: '增长指标', type: PlatformOverviewGrowthSwagger })
  growth!: PlatformOverviewGrowthSwagger;

  @ApiProperty({ description: '续费风险列表', type: [PlatformRenewalRiskItemSwagger] })
  renewalRisks!: PlatformRenewalRiskItemSwagger[];
}
