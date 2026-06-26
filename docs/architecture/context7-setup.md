# Context7 MCP 接入指引

本项目已将 **Context7** 作为推荐的第三方依赖库文档事实源，以辅助 AI 编码代理（如 Antigravity, Claude Code 等）或 IDE 插件（如 Cursor）实现最新库 API 的免幻觉生成。

---

## 1. 什么是 Context7？

Context7 是一个为 LLM 和 AI 辅助编辑器提供实时、最新、具体版本第三方库文档上下文的平台。它可以直接将高质量文档以 MCP Tool 的形式注入 AI 助手的上下文中，从而：
- 避免 AI 生成早已废弃的方法或参数；
- 防止 AI 捏造不存在的 API 结构；
- 省去手动复制粘贴官方文档的繁琐过程。

---

## 2. 客户端接入指引

### A. 接入 Claude Code (CLI)
如果您在本地终端使用 `claude` (Anthropic 官方 CLI 智能代理)，可以通过以下命令快速添加 Context7 MCP 服务：

```bash
# 执行快速安装并添加 mcp
npx ctx7 setup --claude
```
或者手动将其添加到您的全局 mcp 配置文件 `~/.claude.json` 中：
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-http"],
      "env": {
        "CONTEXT7_API_KEY": "YOUR_CONTEXT7_API_KEY"
      }
    }
  }
}
```
*(注：您可以在 [context7.com](https://context7.com) 免费申请您的 API Key 获取更高的频次限额)*

---

### B. 接入 Cursor (IDE)
如果您使用 Cursor 编辑器作为开发环境，可在 IDE 设置中直接添加 MCP Server：
1. 打开 **Cursor Settings** -> **Features** -> **MCP**。
2. 点击 **+ Add New MCP Server**。
3. 填入参数：
   - **Name**: `context7`
   - **Type**: `sse` 或 `command` (推荐 command)
   - **Command**: `npx -y ctx7@latest mcp`
   *(或者使用 SSE URL: `https://mcp.context7.com/mcp`，并通过 Header 或环境变量传入 `CONTEXT7_API_KEY`)*
4. 点击 **Save** 并验证状态是否显示为绿色 `Connected`。

---

### C. 接入 Antigravity AI Code Assist
如果您使用 Antigravity Pair-programming 助手，它在遇到包含第三方库导入（如 `@nestjs/*`、`dayjs` 等）的需求时，会自动通过规则调用系统集成的 Context7 工具。

---

## 3. 编写 Prompts 时如何引导使用

在向 AI 提出编码需求时，可以直接使用 `use context7` 或指定库 ID，Context7 会跳过匹配直达文档：

* **泛文档匹配**：
  > "用 NestJS 的 JwtService 写一个 token 刷新守卫，use context7"
* **精准库文档直达**：
  > "请为我配置 Redis 客户端的连接池。use library /redis/redis for docs"
