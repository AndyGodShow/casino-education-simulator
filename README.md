# Casino Education Simulator

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff.svg)](https://vite.dev/)

一个面向概率学习的教育模拟平台。项目通过传统赌场游戏和体育预测实验室，帮助用户观察赌场优势、赔率结构、资金曲线、短期波动、市场隐含概率和常见下注策略在长期中的表现。

> 本项目仅供数学教育、概率研究与前端练习使用，不提供真实下注、充值、提现、钱包连接、真实交易或任何赌博服务。所有资金均为虚拟资金，外部市场数据只作为市场情绪和隐含概率参考。

## 功能概览

- 8 款教育模拟游戏：百家乐、二十一点、欧洲轮盘、老虎机、骰宝、龙虎斗、三公、花旗骰。
- 每款游戏包含单局演示、规则说明、概率科普和批量模拟入口。
- 批量模拟支持不同下注策略对比，并展示胜率、RTP、盈亏和资产曲线。
- 支持 URL Hash 直达游戏页面，例如 `#/games/baccarat`。
- 新平台入口：`#/` 显示 Traditional Games 和 Sports Prediction Lab 两个一级板块。
- 新传统游戏入口：`#/traditional`，并兼容旧路由 `#/games/...`。
- Sports Prediction Lab：`#/sports`，首个可用模块为 Football → World Cup 2026。
- 游戏模块按需加载，降低首次进入大厅的资源开销。
- 所有资金、筹码和结果均为浏览器内模拟数据。

## 游戏内容

| 游戏 | 重点能力 | 示例主题 |
| --- | --- | --- |
| 百家乐 | 标准发牌流程、第三张牌规则、路单 | 押庄/押闲/押和的长期期望 |
| 二十一点 | Ace 双值、S17、基本策略提示 | 基本策略与资金波动 |
| 欧洲轮盘 | 37 格单零轮盘、多类下注 | 外围注、直注、马丁格尔陷阱 |
| 老虎机 | 5 卷轴、符号权重、连线赔付 | RTP 与高波动策略 |
| 骰宝 | 三骰分布、大小单双、围骰 | 低优势下注与高赔率陷阱 |
| 龙虎斗 | 单张比大小、和局退半 | 简单规则下的期望值 |
| 三公 | 三张牌型、点数比较 | 庄闲波动与和局保险 |
| 花旗骰 | Come-out / Point 两阶段流程 | Pass Line 与 Don't Pass |

## 技术栈

- React 19
- TypeScript
- Vite
- Vitest
- Recharts
- CSS Modules

## Project Structure

```text
src/
├── modules/
│   ├── lobby/                       # 新主入口：Traditional Games / Sports Prediction Lab
│   ├── traditional/                 # 传统游戏大厅与 8 款游戏 wrapper
│   └── sports/
│       ├── SportsLobby.tsx
│       ├── components/              # EducationNotice、ProbabilityBar、StatCard 等
│       └── football/
│           └── worldCup/            # World Cup 2026 MVP
├── dataProviders/
│   ├── football/                    # OpenFootball / API-Football / SportMonks 适配器骨架
│   └── polymarket/                  # Polymarket 只读市场参考 provider
├── components/                      # 旧游戏共享 UI
├── games/                           # 传统游戏原始规则、Hook、组件与模拟引擎
├── hooks/
├── logic/
└── utils/
```

## Sports Prediction Lab

体育板块是概率教育、赔率教育、风险管理教育和庄家优势演示，不是博彩推荐站。当前入口包括：

- Football：已开放，包含 World Cup 2026 MVP。
- Basketball：Coming Soon，占位展示，不提供死链接。
- Esports：Coming Soon，占位展示，不提供死链接。

核心教育目标：

- 猜对比赛不等于能赚钱。
- 高胜率不等于有投注价值。
- 低赔率强队也可能是负期望。
- 爆冷是概率分布的一部分。
- 庄家优势来自赔率结构、抽水和风险管理。
- Polymarket 价格只能作为市场隐含概率参考，不能当作真实概率答案。

## World Cup 2026 Module

`#/sports/football/world-cup-2026` 提供第一版世界杯概率教育 MVP：

- 比赛预测：基于球队 rating、attack、defense、form、host context 的规则模型。
- Poisson 比分模型：生成 0 到 6 球比分矩阵、最可能比分和胜平负概率。
- 赔率课堂：展示 decimal odds、隐含概率、overround、去水概率和理论返还率。
- 模拟投注：固定下注、固定比例、Kelly、半 Kelly、四分之一 Kelly、Martingale、All-in 等策略逻辑，其中高风险策略仅用于风险教育。
- 小组出线模拟：12 组 48 队，每组前二和 8 个最好第三名晋级，使用简化 deterministic tiebreaker。
- 庄家模式：展示 overround、赔付率、资金流向和不同赛果下的庄家 exposure。
- Polymarket 市场参考：只读展示市场隐含概率、价差、流动性、更新时间和质量评分。
- 预测复盘：Accuracy、Brier Score、Log Loss、ROI、Max Drawdown 和 calibration buckets。

当前赛程为 local seed/sample fixtures，不声明完整官方 2026 赛程准确性。

## Data Sources

- Local seed data：当前 MVP 默认使用的教育样例数据。
- OpenFootball public domain data：未来可作为静态公开数据源。
- FIFA official schedule：未来作为人工校验来源。
- API-Football：未来可作为实时 provider，必须支持失败降级。
- SportMonks：未来可作为实时 provider，必须支持失败降级。
- Polymarket：只作为市场隐含概率参考，不提供真实概率答案。

Polymarket provider 只允许公开只读能力：Gamma 市场发现、CLOB 价格、订单簿、价差、历史价格等。不实现钱包连接、下单、撤单、用户订单、用户仓位或真实资金能力。

## Safety and Educational Disclaimer

- 不提供真实投注建议、跟单建议、交易建议或投资建议。
- 不接入真实交易、不接入钱包、不跳转真实投注平台。
- 所有余额、筹码、下注和收益均为虚拟资金。
- 外部市场数据可能延迟、错误、缺失或受低流动性影响。
- 市场价格只代表交易者用资金表达的共识，不能作为真实概率答案。

## 快速开始

```bash
npm install
npm run dev
```

常用脚本：

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run preview
```

## 隐私与安全

- 仓库不需要提交 `.env`、`.vercel/`、本地日志、分析输出或任何包含个人路径/账号信息的文件。
- 请不要在 Issue、PR、截图或提交记录中公开真实姓名、手机号、邮箱、钱包地址、API Key、部署项目 ID、团队 ID 等敏感信息。
- 如果需要展示部署效果，优先使用公开演示链接，避免贴出管理后台、私有项目设置或带 token 的 URL。

## 教育说明

赌场游戏的规则通常会让长期期望值偏向庄家。这个模拟器的目标是用可视化和大量重复实验展示这一点：短期结果可能剧烈波动，但样本量增加后，胜率、RTP 和资产曲线会逐渐接近规则决定的数学期望。

请把它当作概率实验室，而不是赢钱工具。
