export const dataSources = [
  { name: '本地样例数据', status: 'active', note: '没有实时数据源时，使用教育样例球队、评分和赛程。' },
  { name: 'OpenFootball 公共数据', status: 'planned', note: '未来可用于导入静态公开赛程数据。' },
  { name: 'FIFA 官方赛程', status: 'manual', note: '手动核验来源；当前 MVP 不声明完整官方赛程准确性。' },
  { name: 'API-Football', status: 'planned', note: '未来可接入的实时数据源，并保留安全降级。' },
  { name: 'SportMonks', status: 'planned', note: '未来可接入的实时数据源，并保留安全降级。' },
  { name: 'Polymarket', status: 'reference-only', note: '仅作为市场隐含概率参考，不是真实概率答案或投注建议。' },
];
