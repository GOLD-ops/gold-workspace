const db = require('./db');

// 内置初始公司信息：新用户首次使用自动导入（用户已有公司则跳过）
// 公司名下不预置任何投递，用户自行投递后产生投递记录
const SEED_COMPANIES = [
  {
    name: '字节跳动',
    channel: '校招交流群 / 官网',
    link: 'https://jobs.bytedance.com/campus/',
    notes: '2027届秋招正式开启，覆盖研发、产品、职能、设计、运营、游戏等多条赛道。',
  },
  {
    name: '搜狐畅游',
    channel: '网申（提前批）',
    link: 'https://app.mokahr.com/campus_apply/cyou-inc/42233?recommendCode=DS9qGDwy#/jobs',
    referral_code: 'DS9qGDwy',
    notes: '2027届秋招提前批，面向27届（部分兼收26届）；流程快、直通面试，提前批未被捞起可参与后续统一笔试。',
  },
  {
    name: '汇川技术',
    channel: '官网投递',
    link: 'https://recruit.inovance.com/#/jobs?ref=APHZ76D',
    referral_code: 'APHZ76D',
    notes: '2027届校园招聘；国产工控领军企业，工作地点覆盖苏州、南京、深圳、上海、西安、北京等地。',
  },
  {
    name: '4399游戏',
    channel: '内推网申',
    link: 'https://hr.4399om.com/weixin/?r=job/agent&type=2&isOpen=0&jobTableType=1&code=z9mit',
    referral_code: 'z9mit',
    notes: '2027届秋季校园招聘正式启动；选择「内推网申」填写学校专属内推码。',
  },
  {
    name: '好未来（学而思）',
    channel: '网申（提前批）',
    link: 'https://app.mokahr.com/campus_apply/tal/148080?recommendCode=DSsxXWDY#/jobs',
    referral_code: 'DSsxXWDY',
    notes: '27届提前批，25-27届毕业生均可投递；薪资15-35W+年薪起，每年4-6次调薪。',
  },
  {
    name: '科大讯飞',
    channel: '网申/内推',
    link: 'https://iflytek.zhiye.com/campus/jobs',
    referral_code: 'ES3T3V',
    notes: '2027届秋招；2025年6月-2027年8月毕业的海内外同学均可投递；最多可投两个岗位，招满即关。',
  },
  {
    name: '联想',
    channel: '校招官网',
    link: 'https://talent.lenovo.com.cn/home',
    referral_code: '2027XZLMWSK（也可用2027XZLMZY）',
    notes: '2027届校招；网申8月5日-11月13日；投递时选择联想员工推荐并填写推荐ITcode。',
  },
  {
    name: '叠纸游戏',
    channel: '官网投递',
    link: 'https://career.papegames.com/s/E3xzfVBWDsg',
    notes: '2027秋季校园招聘正式启动；流程：网申—笔试—面试—offer；校招生专属人才发展计划与带教支持。',
  },
  {
    name: '博西家用电器（BSH）',
    channel: '专属实习通道',
    link: 'https://qr61.cn/ohW6Tw/q7Tbo6n',
    notes: '27届实习招聘专场，理工科优先；西门子/博世家电母公司；优秀实习生可直通27届秋招正式岗位。',
  },
  {
    name: '亿联网络（Yealink）',
    channel: '官网投递（提前批）',
    link: 'https://yealink.zhiye.com/campus/jobs',
    referral_code: 'ESKJAB',
    notes: '2027届校招提前批；云+端AI音视频会议/IP语音通信龙头，与微软等国际品牌深度合作。',
  },
  {
    name: '新东方',
    channel: '网申',
    link: 'https://mp.weixin.qq.com/s/HZvgUHytofq5VYo4DdSH0A?scene=1',
    notes: '2027「π 计划」秋季校招；五险一金+带薪年假；流程：初试→复试→线下培训营→发放offer。',
  },
  {
    name: '帆软',
    channel: '网申（提前批）',
    link: 'https://t6ixa9nyl6.jiandaoyun.com/f/65e1a1308ce7672fded0f0cf?ext=XDUWSK',
    referral_code: 'XDUWSK',
    notes: '2027届秋招提前批；AI+BI赛道，中国BI行业连续8年市占率第一；扁平化管理。',
  },
];

// 为空间导入初始公司（仅当该空间还没有任何公司时执行，幂等）
function seedSpace(spaceId) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM companies WHERE space_id = ?').get(spaceId).n;
  if (count > 0) return { seeded: false, count: 0, reason: '已有公司，跳过' };
  const ts = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO companies (space_id, name, channel, link, referral_code, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let n = 0;
  for (const c of SEED_COMPANIES) {
    insert.run(
      spaceId,
      c.name,
      c.channel || '',
      c.link || '',
      c.referral_code || '',
      c.notes || '',
      ts,
      ts
    );
    n++;
  }
  return { seeded: true, count: n };
}

function seedUser(userId) {
  const space = db
    .prepare('SELECT * FROM spaces WHERE user_id = ? ORDER BY id LIMIT 1')
    .get(userId);
  return space ? seedSpace(space.id) : { seeded: false, count: 0 };
}

module.exports = { SEED_COMPANIES, seedSpace, seedUser };
