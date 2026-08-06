const db = require('./db');

// 内置初始招聘信息：新用户首次使用自动导入（用户已有记录则跳过）
const SEED_COMPANIES = [
  {
    company: '字节跳动',
    position: '研发 / 产品 / 职能 / 设计 / 运营 / 游戏等多条赛道',
    channel: '校招交流群 / 官网',
    link: 'https://jobs.bytedance.com/campus/',
    notes: '2027届秋招正式开启，全校所有专业同学均可投递；群内持续更新秋招岗位与宣讲安排。',
  },
  {
    company: '搜狐畅游',
    position: '游戏策划 / 游戏开发 / 游戏美术 / 游戏运营 / 业务支持 / 平台开发 / 平台职能 / 游戏测试',
    channel: '网申（提前批）',
    link: 'https://app.mokahr.com/campus_apply/cyou-inc/42233?recommendCode=DS9qGDwy#/jobs',
    referral_code: 'DS9qGDwy',
    notes: '2027届秋招提前批，面向27届（部分兼收26届）；流程快、直通面试，提前批未被捞起可参与后续统一笔试，部分热招岗位先到先得。',
  },
  {
    company: '汇川技术',
    position: '技术类 / 营销类 / 质量类 / 技能类 / 供应链管理类 / 其他职能类',
    city: '苏州/南京/深圳/上海/西安/北京/常州/武汉/济南/岳阳/日本/泰国',
    channel: '官网投递',
    link: 'https://recruit.inovance.com/#/jobs?ref=APHZ76D',
    referral_code: 'APHZ76D',
    notes: '2027届校园招聘；国产工控领军企业，工作地点覆盖国内外多个地区。',
  },
  {
    company: '4399游戏',
    position: '产品 / 美术 / 技术 / 运营 / 职能',
    channel: '内推网申',
    link: 'https://hr.4399om.com/weixin/?r=job/agent&type=2&isOpen=0&jobTableType=1&code=z9mit',
    referral_code: 'z9mit',
    notes: '2027届秋季校园招聘正式启动；选择「内推网申」填写学校专属内推码。',
  },
  {
    company: '好未来（学而思）',
    position: '素养教育教师 / 国际语言教师 / 托管 / 竞赛教练',
    city: '全国40+城',
    salary: '15-35W+年薪起',
    channel: '网申（提前批）',
    link: 'https://app.mokahr.com/campus_apply/tal/148080?recommendCode=DSsxXWDY#/jobs',
    referral_code: 'DSsxXWDY',
    notes: '27届提前批，25-27届毕业生均可投递；每年4-6次调薪，六险一金+带薪年假。',
  },
  {
    company: '科大讯飞',
    position: '研究算法 / 研发 / AI研发 / 产品 / 营销 / 职能 / 设计',
    city: '合肥/北京/上海/武汉/深圳/广州/杭州/南京/苏州/西安/成都',
    channel: '网申/内推',
    link: 'https://iflytek.zhiye.com/campus/jobs',
    referral_code: 'ES3T3V',
    notes: '2027届秋招；2025年6月-2027年8月毕业的海内外同学均可投递；最多可投两个岗位，招满即关。',
  },
  {
    company: '联想',
    position: '技术 / 产品与项目 / 设计 / 市场与销售 / 职能 / 供应链',
    city: '北京、上海、深圳、天津、武汉',
    channel: '校招官网',
    link: 'https://talent.lenovo.com.cn/home',
    referral_code: '2027XZLMWSK（也可用2027XZLMZY）',
    notes: '2027届校招；网申8月5日-11月13日；投递时「从哪儿获知招聘信息」选择联想员工推荐并填写推荐ITcode。',
  },
  {
    company: '叠纸游戏',
    position: '技术研发 / 策划 / 美术 / 动画 / 市场运营 / 职能支持 / 音频',
    channel: '官网投递',
    link: 'https://career.papegames.com/s/E3xzfVBWDsg',
    notes: '2027秋季校园招聘正式启动；流程：网申—笔试—面试—offer；校招生专属人才发展计划与带教支持。',
  },
  {
    company: '博西家用电器（BSH）',
    position: 'AI软件测试 / 力学 / 测试工程师 / 冰箱制冷系统创新研究 / 基准技术 / 人力实习生',
    city: '南京',
    channel: '专属实习通道',
    link: 'https://qr61.cn/ohW6Tw/q7Tbo6n',
    notes: '27届实习招聘专场，理工科优先；西门子/博世家电母公司；优秀实习生可直通27届秋招正式岗位，投递截止8月31日。',
  },
  {
    company: '亿联网络（Yealink）',
    position: '研发类 / 营销类 / 产品类',
    city: '厦门',
    channel: '官网投递（提前批）',
    link: 'https://yealink.zhiye.com/campus/jobs',
    referral_code: 'ESKJAB',
    notes: '2027届校招提前批；云+端AI音视频会议/IP语音通信龙头，与微软等国际品牌深度合作。',
  },
  {
    company: '新东方',
    position: '儿童素养教师 / 学习机教师 / 高中教师',
    city: '全国50+城市',
    salary: '12-25w/年',
    channel: '网申',
    link: 'https://mp.weixin.qq.com/s/HZvgUHytofq5VYo4DdSH0A?scene=1',
    notes: '2027「π 计划」秋季校招；五险一金+带薪年假；流程：初试→复试→线下培训营→发放offer。',
  },
  {
    company: '帆软',
    position: '技术 / 产品 / 运营 / 销售',
    salary: '非技术岗可达20K',
    channel: '网申（提前批）',
    link: 'https://t6ixa9nyl6.jiandaoyun.com/f/65e1a1308ce7672fded0f0cf?ext=XDUWSK',
    referral_code: 'XDUWSK',
    notes: '2027届秋招提前批；AI+BI赛道，中国BI行业连续8年市占率第一；扁平化管理，work life balance。',
  },
];

// 为用户导入初始数据（仅当该用户还没有任何记录时执行，幂等）
function seedUser(userId) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM companies WHERE user_id = ?').get(userId).n;
  if (count > 0) return { seeded: false, count: 0, reason: '已有记录，跳过' };
  const ts = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO companies
     (user_id, company, position, department, city, salary, channel, link, referral_code, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '未投递', ?, ?)`
  );
  let n = 0;
  for (const c of SEED_COMPANIES) {
    insert.run(
      userId,
      c.company,
      c.position || '',
      c.department || '',
      c.city || '',
      c.salary || '',
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

module.exports = { SEED_COMPANIES, seedUser };
