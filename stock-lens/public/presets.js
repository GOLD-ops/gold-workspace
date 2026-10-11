// 预制方案只提供待确认的研究条件，不含股票、候选数量或金融数据。
const condition = (id, field, op, value, origin) => ({
  id, field, op, value, enabled: true, origin
});

const templates = [
  {
    id: 'business-valuation',
    name: '经营与估值',
    blurb: '观察收入、利润不下降，且估值和历史波动率在指定范围内的公司。',
    category: '综合观察',
    industry: '全部行业',
    intent: '营收同比和归母净利润同比不低于0%，市盈率TTM不超过25倍，60日年化波动率不超过30%。',
    conditions: [
      condition('revenue', 'revenueGrowth', 'gte', 0, '预制假设：营收同比不低于0%（需确认）'),
      condition('profit', 'profitGrowth', 'gte', 0, '预制假设：归母净利润同比不低于0%（需确认）'),
      condition('pe', 'pe', 'lte', 25, '预制假设：市盈率TTM不超过25倍（需确认）'),
      condition('vol', 'volatility', 'lte', 30, '预制假设：60日年化波动率不超过30%（需确认）')
    ],
    assumptions: [
      '收入、利润不下降采用最新已披露累计报告期同比，不能据此判断未来经营表现。',
      '25倍市盈率是可修改的绝对阈值，没有比较各行业的估值水平。',
      '历史波动率不代表未来风险；请核对条件后再执行筛选。'
    ]
  },
  {
    id: 'bank-valuation',
    name: '低估值银行',
    blurb: '在银行范围内，以市盈率上限和收入不下降作为观察条件。',
    category: '行业观察',
    industry: '银行',
    intent: '只看银行，营收同比不低于0%，市盈率TTM不超过15倍。',
    conditions: [
      condition('revenue', 'revenueGrowth', 'gte', 0, '预制假设：营收同比不低于0%（需确认）'),
      condition('pe', 'pe', 'lte', 15, '预制假设：市盈率TTM不超过15倍（需确认）')
    ],
    assumptions: [
      '“低估值”在这里仅指市盈率TTM不超过15倍，不等于低于行业均值或被低估。',
      '方案没有考察资产质量、资本充足率或未来盈利，请检查其适用性。',
      '行业范围与阈值均可修改；确认后才会执行筛选。'
    ]
  },
  {
    id: 'growth-drawdown',
    name: '增长与回撤',
    blurb: '将利润增长和历史回撤结合起来，检查两类条件是否同时满足。',
    category: '增长观察',
    industry: '全部行业',
    intent: '营收同比不低于0%，归母净利润同比不低于10%，60日最大回撤不超过10%。',
    conditions: [
      condition('revenue', 'revenueGrowth', 'gte', 0, '预制假设：营收同比不低于0%（需确认）'),
      condition('profit', 'profitGrowth', 'gte', 10, '预制假设：归母净利润同比不低于10%（需确认）'),
      condition('drawdown', 'drawdown', 'lte', 10, '预制假设：60日最大回撤不超过10%（需确认）')
    ],
    assumptions: [
      '利润增长使用已披露累计报告期同比；上年同期利润非正时，不能按普通增长率判断。',
      '最大回撤按历史收盘价计算，10%表示回撤幅度的上限，不是收益目标。',
      '方案未限制估值，历史回撤也不代表未来回撤；请检查后再确认。'
    ]
  },
  {
    id: 'low-volatility',
    name: '低波动观察',
    blurb: '在收入、利润和估值条件之外，使用更低的历史波动率上限。',
    category: '走势观察',
    industry: '全部行业',
    intent: '营收同比和归母净利润同比不低于0%，市盈率TTM不超过25倍，60日年化波动率不超过20%。',
    conditions: [
      condition('revenue', 'revenueGrowth', 'gte', 0, '预制假设：营收同比不低于0%（需确认）'),
      condition('profit', 'profitGrowth', 'gte', 0, '预制假设：归母净利润同比不低于0%（需确认）'),
      condition('pe', 'pe', 'lte', 25, '预制假设：市盈率TTM不超过25倍（需确认）'),
      condition('vol', 'volatility', 'lte', 20, '预制假设：60日年化波动率不超过20%（需确认）')
    ],
    assumptions: [
      '“低波动”仅指60日年化波动率不超过20%，没有与全部市场股票作排名比较。',
      '收入、利润和估值采用各自的数据时点，请在股票依据中核对。',
      '低历史波动率不保证未来走势稳定；阈值可修改，确认后才会执行筛选。'
    ]
  }
];

function freezeTemplate(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeTemplate);
    Object.freeze(value);
  }
  return value;
}

export const PRESETS = freezeTemplate(templates);

// 每次载入都是独立草稿，编辑、保存和再次载入不会污染预制模板。
export function presetDraft(id) {
  const preset = PRESETS.find(item => item.id === id);
  return preset ? structuredClone(preset) : null;
}
