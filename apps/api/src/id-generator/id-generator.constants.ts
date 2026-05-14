export const ID_CONFIG = {
  // 按天重置（prefix + YYYYMMDD + 序号）
  ORDER: { prefix: 'ORD', digits: 6 },
  PAYMENT: { prefix: 'PAY', digits: 6 },
  PAYMENT_ORDER: { prefix: 'PO', digits: 6 },
  IMPORT_JOB: { prefix: 'IJ', digits: 5 },
  ORDER_REMINDER: { prefix: 'RMD', digits: 5 },
  ORDER_PRINT: { prefix: 'OPR', digits: 5 },
  // 全局递增（prefix + 序号）
  TENANT: { prefix: 'T', seqName: 'tenant_seq', digits: 6 },
  NOTICE: { prefix: 'NTC', seqName: 'notice_seq', digits: 5 },
  CERTIFICATION: { prefix: 'CERT', seqName: 'cert_seq', digits: 5 },
} as const;
