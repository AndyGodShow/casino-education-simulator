#!/bin/bash
# 开启严苛模式：任何一行命令返回非零（报错）立刻中止脚本
set -euo pipefail

echo -e "\n🔍 [质量门禁 1/6] 正在执行严格代码规范检查 (Lint)..."
npm run lint

echo -e "\n🏗️ [质量门禁 2/6] 正在执行 TypeScript 类型深度编译检查 (Type Check)..."
npm run typecheck

echo -e "\n🧪 [质量门禁 3/6] 正在运行核心业务单元测试 (Test)..."
npm run test

echo -e "\n📦 [质量门禁 4/6] 正在验证生产构建 (Build)..."
npm run build

echo -e "\n🌐 [质量门禁 5/6] 正在运行浏览器端到端测试 (E2E)..."
npm run test:e2e

echo -e "\n🛡️ [质量门禁 6/6] 正在检查高危依赖漏洞 (Audit)..."
npm audit --audit-level=high

CURRENT_BRANCH=$(git branch --show-current)
if [ -z "$CURRENT_BRANCH" ]; then
    echo -e "\n❌ 当前处于 detached HEAD，无法安全发布。请先切换到明确分支。"
    exit 1
fi

# 只提交用户已经明确暂存的改动，避免把工作区里的无关内容一起发布。
if git diff --cached --quiet; then
    echo -e "\n⚡ 没有检测到已暂存改动。请先用 git add 精确选择要发布的文件。"
    exit 0
fi

echo -e "\n📦 质量门禁通过，正在打包发布..."
MSG=${1:-"deploy: $(date +'%Y-%m-%d %H:%M:%S') auto-deploy via script"}
git commit -m "$MSG"

echo -e "\n🚀 正在推送当前分支 ($CURRENT_BRANCH) 至 GitHub 触发 Vercel 自动构建..."
git push origin "$CURRENT_BRANCH"

echo -e "\n✅ 发布完成！线上环境将在大约 1-2 分钟内同步最新代码。\n"
