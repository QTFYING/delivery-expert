const fs = require('node:fs');
const path = require('node:path');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { PrismaClient } = require('@prisma/client');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { apiRequest, expectHttpFailure, loadEnvFromFile, sanitizeDatabaseUrl, serializeError } = require('../shared/helpers');
const { FIXTURES, prepareFixtures, buildImportTemplatePayload, buildImportRows, waitImportJob } = require('./fixtures');

loadEnvFromFile(path.join(__dirname, '..', '..', '.env'));
process.env.AUTH_COOKIE_SECURE = 'false';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.IMPORT_JOB_WORKER_ENABLED = 'true';

const { AppModule } = require('../../dist/app.module');
const { ResponseInterceptor } = require('../../dist/common/interceptors/response.interceptor');
const { GlobalExceptionFilter } = require('../../dist/common/filters/business-exception.filter');

const prisma = new PrismaClient();

const runtimeDir = path.join(__dirname, '..', '..', '.runtime');
const resultPath = path.join(runtimeDir, 'backend-regression-result.json');

async function main() {
  fs.mkdirSync(runtimeDir, { recursive: true });

  const results = {
    startedAt: new Date().toISOString(),
    environment: {
      database: sanitizeDatabaseUrl(process.env.DATABASE_URL || ''),
      redis: process.env.REDIS_URL || '',
      importWorkerEnabled: process.env.IMPORT_JOB_WORKER_ENABLED,
    },
    fixtures: {
      tenantId: FIXTURES.tenantId,
      ownerAccount: FIXTURES.ownerAccount,
      financeAccount: FIXTURES.financeAccount,
      sourceOrderNo: FIXTURES.sourceOrderNo,
    },
    steps: [],
  };

  let app;
  try {
    await prepareFixtures(prisma);

    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.enableCors({
      origin: true,
      credentials: true,
    });

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Regression Runner')
      .setDescription('Local backend regression runner')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.createDocument(app, swaggerConfig);

    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer();
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}/api`;

    results.baseUrl = baseUrl;

    const ownerSession = { token: null, cookie: null };
    const financeSession = { token: null, cookie: null };
    const readOnlySession = { token: null, cookie: null };
    const osAdminSession = { token: null, cookie: null };

    const ownerLogin = await apiRequest(results, 'Auth Owner Login', {
      method: 'POST',
      url: `${baseUrl}/auth/login`,
      body: {
        account: FIXTURES.ownerAccount,
        password: FIXTURES.password,
      },
    });
    ownerSession.token = ownerLogin.data.accessToken;
    ownerSession.cookie = ownerLogin.cookie;

    const osAdminLogin = await apiRequest(results, 'Auth OS Admin Login', {
      method: 'POST',
      url: `${baseUrl}/auth/login`,
      body: {
        account: FIXTURES.osAdminAccount,
        password: FIXTURES.password,
      },
    });
    osAdminSession.token = osAdminLogin.data.accessToken;
    osAdminSession.cookie = osAdminLogin.cookie;

    const readOnlyLogin = await apiRequest(results, 'Auth ReadOnly Login', {
      method: 'POST',
      url: `${baseUrl}/auth/login`,
      body: {
        account: FIXTURES.readOnlyAccount,
        password: FIXTURES.password,
      },
    });
    readOnlySession.token = readOnlyLogin.data.accessToken;
    readOnlySession.cookie = readOnlyLogin.cookie;

    await apiRequest(results, 'Auth Me', {
      method: 'GET',
      url: `${baseUrl}/auth/me`,
      token: ownerSession.token,
    });

    const oldOwnerCookie = ownerSession.cookie;
    const refreshResult = await apiRequest(results, 'Auth Refresh', {
      method: 'POST',
      url: `${baseUrl}/auth/refresh`,
      cookie: ownerSession.cookie,
    });
    ownerSession.token = refreshResult.data.accessToken;
    ownerSession.cookie = refreshResult.cookie;

    await expectHttpFailure(
      results,
      'Auth Refresh Old Cookie Invalid',
      {
        method: 'POST',
        url: `${baseUrl}/auth/refresh`,
        cookie: oldOwnerCookie,
      },
      401,
    );

    const createdTenant = await apiRequest(results, 'Admin Tenant Create With RBAC Bootstrap', {
      method: 'POST',
      url: `${baseUrl}/tenants`,
      token: osAdminSession.token,
      body: {
        name: '联调新建租户 RBAC',
        softwareVersion: 'L1',
        ownerName: '新租户老板',
        address: '深圳市南山区新租户路 1 号',
        licenseNo: 'LIC-RBAC-BOOTSTRAP',
        channel: 'lakala',
        serviceExpireAt: '2027-05-13',
        ownerAccount: FIXTURES.createdTenantOwnerAccount,
        ownerInitialPassword: '123456',
      },
    });
    if (!createdTenant.data.id) {
      throw new Error('平台新建租户未返回租户 ID');
    }

    const createdTenantOwnerLogin = await apiRequest(results, 'Auth Created Tenant Owner Login', {
      method: 'POST',
      url: `${baseUrl}/auth/login`,
      body: {
        account: FIXTURES.createdTenantOwnerAccount,
        password: '123456',
      },
    });

    await apiRequest(results, 'Auth Created Tenant Owner Change Password', {
      method: 'POST',
      url: `${baseUrl}/auth/change-password`,
      token: createdTenantOwnerLogin.data.accessToken,
      body: {
        currentPassword: '123456',
        newPassword: FIXTURES.createdTenantOwnerPassword,
      },
    });

    const createdTenantOwnerCurrentLogin = await apiRequest(results, 'Auth Created Tenant Owner ReLogin', {
      method: 'POST',
      url: `${baseUrl}/auth/login`,
      body: {
        account: FIXTURES.createdTenantOwnerAccount,
        password: FIXTURES.createdTenantOwnerPassword,
      },
    });
    const createdTenantOwnerMe = await apiRequest(results, 'Auth Created Tenant Owner Me With RBAC', {
      method: 'GET',
      url: `${baseUrl}/auth/me`,
      token: createdTenantOwnerCurrentLogin.data.accessToken,
    });
    if (
      createdTenantOwnerMe.data.tenantId !== createdTenant.data.id ||
      createdTenantOwnerMe.data.roleCode !== 'TENANT_OWNER' ||
      !createdTenantOwnerMe.data.roleId ||
      !createdTenantOwnerMe.data.permissions.includes('settings.roles.manage')
    ) {
      throw new Error('平台新建租户老板账号未完成 RBAC 绑定');
    }

    await apiRequest(results, 'Tenant Profile Created Owner Permission Allowed', {
      method: 'GET',
      url: `${baseUrl}/tenant/profile`,
      token: createdTenantOwnerCurrentLogin.data.accessToken,
    });

    await apiRequest(results, 'Settings General Get', {
      method: 'GET',
      url: `${baseUrl}/settings/general`,
      token: ownerSession.token,
    });

    await apiRequest(results, 'Settings General Update', {
      method: 'PUT',
      url: `${baseUrl}/settings/general`,
      token: ownerSession.token,
      body: {
        qrCodeExpiry: 60,
        notifySeller: true,
        notifyOwner: true,
        notifyFinance: true,
        creditRemindDays: 5,
        dailyReportPush: true,
      },
    });

    const permissionTree = await apiRequest(results, 'Settings Permissions Tree', {
      method: 'GET',
      url: `${baseUrl}/settings/permissions`,
      token: ownerSession.token,
    });
    if (!permissionTree.data.version || !Array.isArray(permissionTree.data.domains) || permissionTree.data.domains.length === 0) {
      throw new Error('权限能力树响应缺少 version 或 domains');
    }

    const roleList = await apiRequest(results, 'Settings Roles List', {
      method: 'GET',
      url: `${baseUrl}/settings/roles`,
      token: ownerSession.token,
    });
    const financeRole = roleList.data.find((role) => role.code === 'TENANT_FINANCE');
    const operatorRole = roleList.data.find((role) => role.code === 'TENANT_OPERATOR');
    if (!financeRole?.id || !operatorRole?.id) {
      throw new Error('角色列表缺少财务或打单员内置角色');
    }

    const customRole = await apiRequest(results, 'Settings Role Create', {
      method: 'POST',
      url: `${baseUrl}/settings/roles`,
      token: ownerSession.token,
      body: {
        name: '联调 RBAC 自定义角色',
        description: '用于回归验证的临时角色',
        permissionCodes: ['orders.read', 'notifications.read'],
      },
    });
    if (customRole.data.isSystem !== false || customRole.data.isEditable !== true || !customRole.data.permissions.includes('orders.read')) {
      throw new Error('自定义角色创建响应不符合 RBAC 契约');
    }

    const updatedCustomRole = await apiRequest(results, 'Settings Role Update', {
      method: 'PUT',
      url: `${baseUrl}/settings/roles/${customRole.data.id}`,
      token: ownerSession.token,
      body: {
        name: '联调 RBAC 自定义角色更新',
        permissionCodes: ['orders.read', 'orders.manage'],
      },
    });
    if (updatedCustomRole.data.name !== '联调 RBAC 自定义角色更新' || !updatedCustomRole.data.permissions.includes('orders.manage')) {
      throw new Error('自定义角色更新响应不符合 RBAC 契约');
    }

    const rbacUser = await apiRequest(results, 'Settings User Create With RoleId', {
      method: 'POST',
      url: `${baseUrl}/settings/users`,
      token: ownerSession.token,
      body: {
        name: '联调 RBAC 员工',
        phone: FIXTURES.rbacUserPhone,
        account: FIXTURES.rbacUserAccount,
        roleId: financeRole.id,
      },
    });
    if (rbacUser.data.roleId !== financeRole.id || rbacUser.data.roleCode !== 'TENANT_FINANCE') {
      throw new Error('创建用户未按 roleId 返回财务角色绑定');
    }

    const updatedRbacUser = await apiRequest(results, 'Settings User Update RoleId', {
      method: 'PUT',
      url: `${baseUrl}/settings/users/${rbacUser.data.id}`,
      token: ownerSession.token,
      body: {
        roleId: operatorRole.id,
      },
    });
    if (updatedRbacUser.data.roleId !== operatorRole.id || updatedRbacUser.data.roleCode !== 'TENANT_OPERATOR') {
      throw new Error('更新用户未按 roleId 返回打单员角色绑定');
    }

    await expectHttpFailure(
      results,
      'Settings User Reject Cross Tenant RoleId',
      {
        method: 'PUT',
        url: `${baseUrl}/settings/users/${rbacUser.data.id}`,
        token: ownerSession.token,
        body: {
          roleId: FIXTURES.otherTenantRoleId,
        },
      },
      404,
    );

    const templateCreate = await apiRequest(results, 'Import Template Create', {
      method: 'POST',
      url: `${baseUrl}/import/templates`,
      token: ownerSession.token,
      body: buildImportTemplatePayload(),
    });
    const templateId = templateCreate.data.id;

    await apiRequest(results, 'Settings Printing List Before Config', {
      method: 'GET',
      url: `${baseUrl}/settings/printing`,
      token: ownerSession.token,
    });

    await apiRequest(results, 'Settings Printing Detail Before Config', {
      method: 'GET',
      url: `${baseUrl}/settings/printing/${templateId}`,
      token: ownerSession.token,
    });

    await apiRequest(results, 'Settings Printing Update', {
      method: 'PUT',
      url: `${baseUrl}/settings/printing/${templateId}`,
      token: ownerSession.token,
      body: {
        configVersion: 1,
        config: {
          page: { width: 210, height: 297 },
          fields: [
            { key: 'customer', x: 20, y: 20 },
            { key: 'summary', x: 20, y: 40 },
            { key: 'qrCodeToken', x: 150, y: 20 },
          ],
        },
        remark: '联调用打印模板',
      },
    });

    await apiRequest(results, 'Settings Printing Detail After Config', {
      method: 'GET',
      url: `${baseUrl}/settings/printing/${templateId}`,
      token: ownerSession.token,
    });

    const previewResult = await apiRequest(results, 'Import Preview', {
      method: 'POST',
      url: `${baseUrl}/import/preview`,
      token: ownerSession.token,
      body: {
        templateId,
        orders: buildImportRows(),
      },
    });
    const previewId = previewResult.data.previewId;

    const importSubmit = await apiRequest(results, 'Import Submit', {
      method: 'POST',
      url: `${baseUrl}/orders/import`,
      token: ownerSession.token,
      body: {
        previewId,
        conflictPolicy: 'overwrite',
      },
    });
    const jobId = importSubmit.data.jobId;

    const importJob = await waitImportJob(baseUrl, ownerSession.token, jobId, results);
    if (importJob.data.status !== 'completed') {
      throw new Error(`导入任务未完成，最终状态=${importJob.data.status}`);
    }

    await apiRequest(results, 'Orders List ReadOnly Permission Allowed', {
      method: 'GET',
      url: `${baseUrl}/orders?keyword=${encodeURIComponent(FIXTURES.sourceOrderNo)}`,
      token: readOnlySession.token,
    });

    await expectHttpFailure(
      results,
      'Orders Create ReadOnly Permission Denied',
      {
        method: 'POST',
        url: `${baseUrl}/orders`,
        token: readOnlySession.token,
        body: {
          customer: '只读权限客户',
          amount: 10,
          payType: 'cash',
          summary: '只读权限不应创建订单',
        },
      },
      403,
    );

    const readOnlyUserList = await apiRequest(results, 'Settings Users List For Permission Version', {
      method: 'GET',
      url: `${baseUrl}/settings/users`,
      token: ownerSession.token,
    });
    const readOnlyUser = readOnlyUserList.data.find((user) => user.phone === FIXTURES.readOnlyPhone);
    if (!readOnlyUser?.id) {
      throw new Error('未找到只读权限回归用户');
    }

    await apiRequest(results, 'Settings User Bind Custom Role For Permission Invalidation', {
      method: 'PUT',
      url: `${baseUrl}/settings/users/${readOnlyUser.id}`,
      token: ownerSession.token,
      body: {
        roleId: updatedCustomRole.data.id,
      },
    });

    const readOnlyCustomRoleLogin = await apiRequest(results, 'Auth ReadOnly Login Before Role Permission Change', {
      method: 'POST',
      url: `${baseUrl}/auth/login`,
      body: {
        account: FIXTURES.readOnlyAccount,
        password: FIXTURES.password,
      },
    });

    const readOnlyRoleMeBeforePermissionChange = await apiRequest(results, 'Auth Me ReadOnly Before Role Permission Change', {
      method: 'GET',
      url: `${baseUrl}/auth/me`,
      token: readOnlyCustomRoleLogin.data.accessToken,
    });

    await apiRequest(results, 'Orders List Custom Role Permission Allowed', {
      method: 'GET',
      url: `${baseUrl}/orders?keyword=${encodeURIComponent(FIXTURES.sourceOrderNo)}`,
      token: readOnlyCustomRoleLogin.data.accessToken,
    });

    await apiRequest(results, 'Settings Role Update Permission Invalidates Bound Users', {
      method: 'PUT',
      url: `${baseUrl}/settings/roles/${updatedCustomRole.data.id}`,
      token: ownerSession.token,
      body: {
        permissionCodes: ['notifications.read'],
      },
    });

    await expectHttpFailure(
      results,
      'Orders List Old Token Role Permission Version Changed',
      {
        method: 'GET',
        url: `${baseUrl}/orders?keyword=${encodeURIComponent(FIXTURES.sourceOrderNo)}`,
        token: readOnlyCustomRoleLogin.data.accessToken,
      },
      403,
      4006,
    );

    const readOnlyRoleMeAfterPermissionChange = await apiRequest(results, 'Auth Me ReadOnly After Role Permission Change', {
      method: 'GET',
      url: `${baseUrl}/auth/me`,
      token: readOnlyCustomRoleLogin.data.accessToken,
    });
    if (readOnlyRoleMeAfterPermissionChange.data.permissionVersion <= readOnlyRoleMeBeforePermissionChange.data.permissionVersion) {
      throw new Error('角色权限变更后 /auth/me 未返回递增后的 permissionVersion');
    }

    const readOnlyCurrentLogin = await apiRequest(results, 'Auth ReadOnly Login Before User Role Change', {
      method: 'POST',
      url: `${baseUrl}/auth/login`,
      body: {
        account: FIXTURES.readOnlyAccount,
        password: FIXTURES.password,
      },
    });
    readOnlySession.token = readOnlyCurrentLogin.data.accessToken;
    readOnlySession.cookie = readOnlyCurrentLogin.cookie;

    const readOnlyMeBeforePermissionChange = await apiRequest(results, 'Auth Me ReadOnly Before Permission Change', {
      method: 'GET',
      url: `${baseUrl}/auth/me`,
      token: readOnlySession.token,
    });

    await apiRequest(results, 'Settings User Update RoleId Invalidates Permission Version', {
      method: 'PUT',
      url: `${baseUrl}/settings/users/${readOnlyUser.id}`,
      token: ownerSession.token,
      body: {
        roleId: operatorRole.id,
      },
    });

    await expectHttpFailure(
      results,
      'Orders List Old Token Permission Version Changed',
      {
        method: 'GET',
        url: `${baseUrl}/orders?keyword=${encodeURIComponent(FIXTURES.sourceOrderNo)}`,
        token: readOnlySession.token,
      },
      403,
      4006,
    );

    const readOnlyMeAfterPermissionChange = await apiRequest(results, 'Auth Me ReadOnly After Permission Change', {
      method: 'GET',
      url: `${baseUrl}/auth/me`,
      token: readOnlySession.token,
    });
    if (readOnlyMeAfterPermissionChange.data.permissionVersion <= readOnlyMeBeforePermissionChange.data.permissionVersion) {
      throw new Error('用户角色变更后 /auth/me 未返回递增后的 permissionVersion');
    }
    const orderList = await apiRequest(results, 'Orders List', {
      method: 'GET',
      url: `${baseUrl}/orders?keyword=${encodeURIComponent(FIXTURES.sourceOrderNo)}`,
      token: ownerSession.token,
    });
    const order = orderList.data.list.find((item) => item.sourceOrderNo === FIXTURES.sourceOrderNo);
    if (!order) {
      throw new Error('未找到导入后的订单');
    }

    const orderId = order.id;
    const qrCodeToken = order.qrCodeToken;

    await apiRequest(results, 'Order Detail', {
      method: 'GET',
      url: `${baseUrl}/orders/${orderId}`,
      token: ownerSession.token,
    });

    await apiRequest(results, 'H5 Payment Detail', {
      method: 'GET',
      url: `${baseUrl}/pay/${qrCodeToken}`,
    });

    await apiRequest(results, 'H5 Submit Offline Cash', {
      method: 'POST',
      url: `${baseUrl}/pay/${qrCodeToken}/offline-payment`,
      body: {
        paymentMethod: 'cash',
        remark: '联调现金登记',
      },
    });

    await apiRequest(results, 'H5 Payment Status Pending Verification', {
      method: 'GET',
      url: `${baseUrl}/pay/${qrCodeToken}/status`,
    });

    const financeLogin = await apiRequest(results, 'Auth Finance Login', {
      method: 'POST',
      url: `${baseUrl}/auth/login`,
      body: {
        account: FIXTURES.financeAccount,
        password: FIXTURES.password,
      },
    });
    financeSession.token = financeLogin.data.accessToken;
    financeSession.cookie = financeLogin.cookie;

    // --- P2-1: 现金核销并发幂等测试 ---
    const verifyPromises = [
      apiRequest(results, 'Cash Verification Create Concurrent 1', {
        method: 'POST',
        url: `${baseUrl}/orders/${orderId}/cash-verifications`,
        token: financeSession.token,
      }).catch((e) => e),
      apiRequest(results, 'Cash Verification Create Concurrent 2', {
        method: 'POST',
        url: `${baseUrl}/orders/${orderId}/cash-verifications`,
        token: financeSession.token,
      }).catch((e) => e),
    ];
    const verifyResults = await Promise.all(verifyPromises);
    const successVerifies = verifyResults.filter((r) => !(r instanceof Error) && r.data);
    if (successVerifies.length !== 1) {
      throw new Error(`现金核销并发幂等测试失败，预期只有1次成功，实际成功了 ${successVerifies.length} 次`);
    }

    await apiRequest(results, 'H5 Payment Status Paid', {
      method: 'GET',
      url: `${baseUrl}/pay/${qrCodeToken}/status`,
    });

    // --- P2-1: Webhook 验签失败测试 ---
    await expectHttpFailure(
      results,
      'Webhook Signature Invalid',
      {
        method: 'POST',
        url: `${baseUrl}/payment/webhook/lakala`,
        body: {
          gatewayTradeNo: 'test_webhook_123',
          amount: '100',
          sign: 'invalid_signature',
        },
      },
      400,
    );

    // --- P2-1: Webhook 缺失网关交易号测试 ---
    // (Assuming signature is bypassed or we mock it if it's correct format, but since we can't easily sign here without private key, we expect signature verification failed which is 400 anyway. Wait, signature check is the first thing.)
    // If signature check is the first thing, it will return 400 for signature verification failed
    // Let's just test invalid signature
    // --- P2-1: 账期回款重复提交 (幂等) 测试 ---
    // First, create a new order with CREDIT pay type to test receipt
    const creditOrderCreate = await apiRequest(results, 'Create Credit Order', {
      method: 'POST',
      url: `${baseUrl}/orders`,
      token: ownerSession.token,
      body: {
        customer: '账期测试客户',
        amount: 100,
        payType: 'credit',
        summary: '测试商品',
      },
    });
    const creditOrderId = creditOrderCreate.data.id;

    const idempotencyKey = 'receipt_idempotency_123';
    await apiRequest(results, 'Create Receipt 1', {
      method: 'POST',
      url: `${baseUrl}/orders/${creditOrderId}/receipts`,
      token: financeSession.token,
      body: {
        amount: 50,
        idempotencyKey,
      },
    });

    // Duplicate submission with same idempotencyKey should succeed but not add more payments
    await apiRequest(results, 'Create Receipt 2 (Duplicate)', {
      method: 'POST',
      url: `${baseUrl}/orders/${creditOrderId}/receipts`,
      token: financeSession.token,
      body: {
        amount: 50,
        idempotencyKey,
      },
    });

    const creditOrderDetail = await apiRequest(results, 'Get Credit Order Detail', {
      method: 'GET',
      url: `${baseUrl}/orders/${creditOrderId}`,
      token: ownerSession.token,
    });
    if (creditOrderDetail.data.paid !== 50) {
      throw new Error(`回款幂等测试失败，预期已付 50，实际已付 ${creditOrderDetail.data.paid}`);
    }

    await apiRequest(results, 'Payments Summary', {
      method: 'GET',
      url: `${baseUrl}/payments/summary`,
      token: financeSession.token,
    });

    await apiRequest(results, 'Payments List', {
      method: 'GET',
      url: `${baseUrl}/payments`,
      token: financeSession.token,
    });

    const printRequestId = `print-regression-${Date.now()}`;
    await apiRequest(results, 'Print Record Create With orderId', {
      method: 'POST',
      url: `${baseUrl}/orders/print-records`,
      token: ownerSession.token,
      body: {
        orderId,
        requestId: printRequestId,
        remark: '联调打印成功',
      },
    });

    await apiRequest(results, 'Print Record Replay With orderId', {
      method: 'POST',
      url: `${baseUrl}/orders/print-records`,
      token: ownerSession.token,
      body: {
        orderId,
        requestId: printRequestId,
        remark: '联调打印成功',
      },
    });

    const legacyPrintRequestId = `print-legacy-regression-${Date.now()}`;
    await apiRequest(results, 'Print Record Legacy orderIds[0]', {
      method: 'POST',
      url: `${baseUrl}/orders/print-records`,
      token: ownerSession.token,
      body: {
        orderIds: [orderId],
        requestId: legacyPrintRequestId,
        remark: '联调打印成功',
      },
    });

    await expectHttpFailure(
      results,
      'Print Record Reject Multi orderIds',
      {
        method: 'POST',
        url: `${baseUrl}/orders/print-records`,
        token: ownerSession.token,
        body: {
          orderIds: [orderId, creditOrderId],
          requestId: `print-reject-multi-${Date.now()}`,
          remark: '不允许伪批量打印回执',
        },
      },
      400,
    );

    await expectHttpFailure(
      results,
      'Print Record Reject Mismatched orderId orderIds',
      {
        method: 'POST',
        url: `${baseUrl}/orders/print-records`,
        token: ownerSession.token,
        body: {
          orderId,
          orderIds: [creditOrderId],
          requestId: `print-reject-mismatch-${Date.now()}`,
          remark: '不允许字段不一致',
        },
      },
      400,
    );

    await expectHttpFailure(
      results,
      'Print Record Reject Missing Order Id',
      {
        method: 'POST',
        url: `${baseUrl}/orders/print-records`,
        token: ownerSession.token,
        body: {
          requestId: `print-reject-missing-${Date.now()}`,
          remark: '缺少订单 ID',
        },
      },
      400,
    );

    await expectHttpFailure(
      results,
      'Print Record Reject Reused requestId For Another Order',
      {
        method: 'POST',
        url: `${baseUrl}/orders/print-records`,
        token: ownerSession.token,
        body: {
          orderId: creditOrderId,
          requestId: printRequestId,
          remark: '同 requestId 不允许换订单',
        },
      },
      409,
    );

    await apiRequest(results, 'Print Record Replay Legacy orderIds[0]', {
      method: 'POST',
      url: `${baseUrl}/orders/print-records`,
      token: ownerSession.token,
      body: {
        orderIds: [orderId],
        requestId: legacyPrintRequestId,
        remark: '联调打印成功',
      },
    });

    const printFailureRequestId = `print-failure-regression-${Date.now()}`;
    await apiRequest(results, 'Print Failure Create', {
      method: 'POST',
      url: `${baseUrl}/orders/${orderId}/print-failures`,
      token: ownerSession.token,
      body: {
        reason: '联调打印机卡纸',
        requestId: printFailureRequestId,
        remark: '联调打印失败',
      },
    });

    await apiRequest(results, 'Print Failure Replay', {
      method: 'POST',
      url: `${baseUrl}/orders/${orderId}/print-failures`,
      token: ownerSession.token,
      body: {
        reason: '联调打印机卡纸',
        requestId: printFailureRequestId,
        remark: '联调打印失败',
      },
    });

    const orderPrintRecords = await apiRequest(results, 'Order Print Records', {
      method: 'GET',
      url: `${baseUrl}/orders/${orderId}/print-records`,
      token: ownerSession.token,
    });
    if (orderPrintRecords.data.summary.successCount !== 2) {
      throw new Error(`订单打印历史成功次数异常，预期 2，实际 ${orderPrintRecords.data.summary.successCount}`);
    }
    if (orderPrintRecords.data.summary.failedCount !== 1) {
      throw new Error(`订单打印历史失败次数异常，预期 1，实际 ${orderPrintRecords.data.summary.failedCount}`);
    }
    if (!orderPrintRecords.data.list.some((item) => item.result === 'failed')) {
      throw new Error('订单打印历史未返回失败事件');
    }

    const tenantPrintRecords = await apiRequest(results, 'Tenant Print Records', {
      method: 'GET',
      url: `${baseUrl}/orders/print-records?result=failed`,
      token: ownerSession.token,
    });
    if (tenantPrintRecords.data.summary.failedCount < 1) {
      throw new Error(`跨订单打印追溯失败次数异常，实际 ${tenantPrintRecords.data.summary.failedCount}`);
    }
    if (!tenantPrintRecords.data.list.some((item) => item.orderId === orderId && item.result === 'failed')) {
      throw new Error('跨订单打印追溯未返回当前订单的失败事件');
    }

    await apiRequest(results, 'Order Reminder Create', {
      method: 'POST',
      url: `${baseUrl}/orders/${orderId}/reminders`,
      token: ownerSession.token,
      body: {
        channels: ['sms', 'wechat'],
      },
    });

    const orderDetailAfterPrint = await apiRequest(results, 'Order Detail After Print And Reminder', {
      method: 'GET',
      url: `${baseUrl}/orders/${orderId}`,
      token: ownerSession.token,
    });
    if (orderDetailAfterPrint.data.prints !== 2) {
      throw new Error(`订单打印次数异常，预期 2，实际 ${orderDetailAfterPrint.data.prints}`);
    }
    if (orderDetailAfterPrint.data.printFailedCount !== 1) {
      throw new Error(`订单打印失败次数异常，预期 1，实际 ${orderDetailAfterPrint.data.printFailedCount}`);
    }
    if (!orderDetailAfterPrint.data.lastPrintedAt || !orderDetailAfterPrint.data.lastFailedAt) {
      throw new Error('订单打印缓存字段未正确返回 lastPrintedAt / lastFailedAt');
    }

    await apiRequest(results, 'Auth Logout', {
      method: 'POST',
      url: `${baseUrl}/auth/logout`,
      token: ownerSession.token,
      cookie: ownerSession.cookie,
    });

    await expectHttpFailure(
      results,
      'Auth Refresh After Logout Invalid',
      {
        method: 'POST',
        url: `${baseUrl}/auth/refresh`,
        cookie: ownerSession.cookie,
      },
      401,
    );

    results.finishedAt = new Date().toISOString();
    results.success = true;
  } catch (error) {
    results.finishedAt = new Date().toISOString();
    results.success = false;
    results.error = serializeError(error);
    throw error;
  } finally {
    fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
    if (app) {
      await app.close().catch(() => undefined);
    }
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(serializeError(error));
  process.exit(1);
});
