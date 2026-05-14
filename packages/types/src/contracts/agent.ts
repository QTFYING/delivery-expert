export interface AgentItem {
  /** 服务商 ID */
  id: string;
  /** 服务商名称 */
  name: string;
  /** 区域 */
  region: string;
  /** 商户数 */
  merchants: number;
  /** 成交总额 */
  gmv: number;
  /** 费率 */
  rate: number;
  /** 分佣金额 */
  commission: number;
  /** 服务商状态 */
  status: 'active' | 'pending' | 'paused';
}

export interface AgentSettlementRecordItem {
  /** 结算记录 ID */
  id: string;
  /** 结算金额 */
  amount: number;
  /** 结算周期 */
  period: string;
  /** 结算时间 */
  settledAt: string;
}

export interface AgentSettleResponse {
  /** 结算单 ID */
  settlementId: string;
  /** 结算金额 */
  amount: number;
  /** 结算完成时间 */
  settledAt: string;
}
