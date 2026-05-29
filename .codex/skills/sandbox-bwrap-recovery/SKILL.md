---
name: sandbox-bwrap-recovery
description: Codex / Codex CLI 在 Ubuntu 环境遇到 sandbox、bwrap loopback、fs sandbox helper、apply_patch 读写失败或 shell 管道被沙箱阻断时使用；用于减少无效重试，并按最小权限恢复 workspace 内操作
---

# Sandbox / bwrap 恢复

本技能优先服务 Codex / Codex CLI 的 Ubuntu sandbox / bwrap 恢复。OpenCode 读取时只采纳通用排障原则，不假设 Codex 专属工具参数在 OpenCode 当前会话可用。

本技能只处理本仓库开发环境里的沙箱执行异常，不改变安全边界。

## 触发特征

出现以下任一现象时使用：

- `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`
- `apply_patch` 报 `fs sandbox helper failed`
- 普通读写、`find | rg`、`wc file file` 等命令在 sandbox 下异常失败，但目标路径位于 workspace
- 同一个无破坏性命令在 sandbox 下连续失败，且错误与业务代码无关

## 处理顺序

1. 先判断是否是命令形态导致：
   - 避免管道、命令串、复杂 shell 展开、命令替换和重定向
   - 当前环境提供专用 `Read` / `Glob` / `Grep` 工具时，优先用专用工具完成读文件、找文件和搜内容
   - 当前环境主要通过 shell 执行时，改成单条 `rg`、`sed -n`、`find`、`ls -la`、`git status --short` 分别执行
   - 不要对同一个失败命令盲目重试超过 2 次
2. 文件编辑仍优先使用 `apply_patch`
3. 若 `apply_patch` 连续因 `bwrap` 或 `fs sandbox helper` 失败：
   - 先用当前环境可用的读文件或查看权限方式确认目标文件存在、权限和当前内容
   - 只有确认是目标文件权限异常时才考虑窄范围 `chmod`；不要用 `chmod` 处理 bwrap loopback 或 sandbox helper 本身的问题
   - `chmod` 前必须说明目标路径、当前权限和拟调整权限，并按权限规则请求最小提权
   - 仍失败时，可使用一次性脚本写入，但必须限制到明确目标文件
4. 需要提权时：
   - 按当前 Codex 工具 schema 请求最小提权，例如使用当前会话支持的 `sandbox_permissions: "require_escalated"` 或等价提权字段
   - `justification` 写清楚是为了恢复被 sandbox 阻断的 workspace 内操作
   - 不为 heredoc / 任意脚本提供 `prefix_rule`
   - 不申请宽泛前缀，例如 `python3`、`zsh`、`bash`
   - 如果当前工具 schema 没有对应提权字段，不要伪造参数，停止无效重试并请用户调整运行环境或权限

## 脚本写入的硬约束

只有在 `apply_patch` 连续失败且目标范围很小的时候才允许脚本写入。

脚本写入前必须先做五件事：

1. 确认目标路径位于 workspace 内
2. 回读目标文件当前内容
3. 确认只写入单个明确文件，不使用通配符或目录批量写入
4. 若当前内容与本轮前面读取的内容不一致，停止并询问用户
5. 确认脚本不会改动文件权限、所有者或无关元数据

脚本写入后必须立刻做三件事：

1. 用当前环境可用的读文件方式回读被写文件，检查引号、模板字符串、中文注释和 import 是否被 shell 破坏
2. 运行与该文件直接相关的最小类型检查、格式检查或构建
3. 在用户可见更新或最终回复里说明为何没有使用 `apply_patch`

推荐使用 quoted heredoc，避免 shell 吞掉 TypeScript 字符串引号：

```bash
python3 <<'PY'
from pathlib import Path
Path('target.ts').write_text("""...""", encoding='utf-8')
PY
```

## 禁止事项

- 不用 `git reset --hard`、`git checkout --` 等破坏性操作恢复现场
- 不把 sandbox 问题归因成代码错误
- 不因 sandbox 问题跳过验证
- 不用宽泛提权长期绕开沙箱
- 不在未回读文件的情况下继续后续实现
- 不在脚本写入中使用通配符、目录递归或批量覆盖

## OpenCode 读取说明

- 本技能位于 `.codex/skills`，主要给 Codex 使用
- OpenCode 读取时只采纳通用排障原则：减少无效重试、优先最小权限、写入后回读验证
- OpenCode 不应照抄 Codex 专属工具参数；权限恢复以当前 OpenCode 工具 schema 和 `opencode.json` 权限配置为准
- 新增或修改 skill 后，OpenCode 需要重启才会重新加载配置时发现新内容

## 完成标准

- 当前步骤可以继续执行
- 已确认失败来自 sandbox，而不是业务代码或 TypeScript 错误
- 若使用提权或脚本写入，已回读并通过直接相关验证
