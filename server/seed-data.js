const db = require('./db');

// 内置初始公司信息：新用户首次使用自动导入（用户已有公司则跳过）
// 公司名下不预置任何投递，用户自行投递后产生投递记录
const SEED_COMPANIES = [
  {
    "name": "Shopee研发中心",
    "link": "https://app.mokahr.com/campus_apply/shopee/2962?recommendCode=DSmNj4kr#/jobs",
    "referral_code": "DSmNj4kr",
    "notes": "2027届校园招聘；截止2026/11/30；最多可投递1个志愿。"
  },
  {
    "name": "KUROGAMES库洛",
    "link": "https://kurogame.jobs.feishu.cn/s/TBZWN1bRUHo",
    "referral_code": "",
    "notes": "2027届秋季校园招聘；开放策划、技术、美术、音频、运营、职能等岗位。"
  },
  {
    "name": "安克创新",
    "link": "https://anker-in.jobs.feishu.cn/s/OXsOzaLkF_k",
    "referral_code": "",
    "notes": "2027届全球校园招聘；9大类1000+关键岗位；工作地点深圳、长沙、北京等。"
  },
  {
    "name": "美团",
    "link": "https://zhaopin.meituan.com/web/campus?zp-from=hiring-campus-bole-elephant&staffSsolD=26125698",
    "referral_code": "",
    "notes": "面向2027届毕业生；10大类岗位，AI方向大扩招，新增AI原生岗位；笔试8.22-9.15。"
  },
  {
    "name": "华宝新能",
    "link": "career.hello-tech.com/campus/jobs",
    "referral_code": "EVBMRS",
    "notes": "2027全球校园招聘；研发/营销/供应链管培生；3年快节奏晋升调薪机制。"
  },
  {
    "name": "去哪儿旅行",
    "link": "https://datayi.cn/w/xRxV8QVo",
    "referral_code": "",
    "notes": "2027届校招；技术、产品、运营类；“3+2”混合办公，弹性工作制，带薪年假10天起。"
  },
  {
    "name": "麦吉太文MagicTavern",
    "link": "https://app.mokahr.com/campus_apply/tavern/39918?recommendCode=DSjv4BgA#/jobs",
    "referral_code": "DSjv4BgA",
    "notes": "2027届秋季校园招聘；工作地点北京；岗位涵盖策划、市场、程序、数据分析、美术。"
  },
  {
    "name": "波克",
    "link": "https://boke.jobs.feishu.cn/s/ZUuTHDQtON0",
    "referral_code": "",
    "notes": "2027届秋招；AI全线赋能；岗位覆盖技术、美术、产品、发行、职能等领域。"
  },
  {
    "name": "凌云光",
    "link": "https://app.mokahr.com/m/campus-recruitment/lusterinc/44882?recommendCode=DSXvwe8A#/jobs",
    "referral_code": "DSXvwe8A",
    "notes": "2027届校招；科创板上市，机器视觉行业Top1；工作地点苏州、北京、上海、深圳等。"
  },
  {
    "name": "卧安机器人",
    "link": "https://woanhome.zhiye.com/campus/jobs",
    "referral_code": "EVKR08",
    "notes": "2027届秋季校园招聘；AI具身家庭机器人第一股；招聘算法工程师、运营管培生等。"
  },
  {
    "name": "康冠科技",
    "link": "https://careerktc.zhiye.com/campus/jobs",
    "referral_code": "EVVPT9",
    "notes": "2027届秋季校园招聘；平板显示解决方案商；开放技术研发、产品设计、市场运营等。"
  },
  {
    "name": "恒生电子",
    "link": "https://campus.hundsun.com/campus/jobs",
    "referral_code": "EZBA8V",
    "notes": "2027校园招聘；金融科技公司，FinTech百强；AI方向、开发、测试、技术支持等。"
  },
  {
    "name": "欣旺达",
    "link": "https://sunwodacampus.zhiye.com",
    "referral_code": "",
    "notes": "2027届全球校园招聘正式启动；用心做好每一块电池。"
  },
  {
    "name": "安踏集团",
    "link": "https://app.mokahr.com/su/zbvftx",
    "referral_code": "",
    "notes": "2027届全球校园招聘；生力军，向世界前行。"
  },
  {
    "name": "新芯股份",
    "link": "https://whxmc.zhiye.com/Campus",
    "referral_code": "",
    "notes": "2027届全球校园招聘正式启动；遇见新芯，逐梦前行。"
  },
  {
    "name": "ZURU",
    "link": "https://wecruit.hotjob.cn/SU69fd5a0e1f17c372512fba62/pb/school.html",
    "referral_code": "",
    "notes": "2027届校园招聘；全球排名前十玩具外企；开放商科、创意、设计、研发、制造类岗位。"
  },
  {
    "name": "CVTE视源股份",
    "link": "https://campus.cvte.com/",
    "referral_code": "CVTEXALBY",
    "notes": "2027届全球校园招聘；9大类岗位；地点广州、苏州、合肥、西安、重庆、上海、武汉等。"
  },
  {
    "name": "智元机器人AGIBOT",
    "link": "https://agirobot.jobs.feishu.cn/s/IxspcL4FTyI",
    "referral_code": "",
    "notes": "2027届校园招聘；AI+机器人融合创新；工作地点上海、北京、深圳、海外。"
  },
  {
    "name": "联想",
    "link": "https://talent.lenovo.com.cn",
    "referral_code": "2027XZLSMSZM",
    "notes": "2027届秋招；网申8.5-11.13；AI新赛道、六大职位方向；投递后系统自动触发测评。"
  },
  {
    "name": "DJI大疆",
    "link": "https://app.mokahr.com/campus_apply/dji/143359?recommendCode=DSrP6bY4#/jobs",
    "referral_code": "DSrP6bY4",
    "notes": "2027拓疆者校园招聘；算法、软件、产品、嵌入式、芯片、光学等；城市深圳、上海、北京。"
  },
  {
    "name": "毕马威",
    "link": "https://kpmg.com/cn/zh/services/advisory.html",
    "referral_code": "",
    "notes": "2027秋季校园招聘正式启动。"
  },
  {
    "name": "中国平安",
    "link": "https://campus.pingan.com",
    "referral_code": "",
    "notes": "2027全球校园招聘；6000+OFFER，8大类岗位。"
  },
  {
    "name": "搜狐畅游",
    "link": "https://app.mokahr.com/campus_apply/cyou-inc/42233?recommendCode=DS9qGDwy#/jobs",
    "referral_code": "DS9qGDwy",
    "notes": "2027届秋招提前批；面向27届（部分兼收26届）；直通面试机会，流程快。"
  },
  {
    "name": "作业帮",
    "link": "https://app.mokahr.com/campus-recruitment/zuoyebang/144908?locale=zh-CN#/",
    "referral_code": "",
    "notes": "2027届校园招聘正式启动。"
  },
  {
    "name": "沐曦股份",
    "link": "https://recruitment.metax-tech.com/campus-recruitment/metax-tech/58131#/jobs",
    "referral_code": "",
    "notes": "2027届校园招聘正式启动。"
  },
  {
    "name": "中国东方",
    "link": "https://coamc.zhiye.com/campus",
    "referral_code": "",
    "notes": "2027年度校园招聘；智汇东方，才聚未来。"
  },
  {
    "name": "光大证券",
    "link": "http://ebscn.zhiye.com/campus",
    "referral_code": "",
    "notes": "2027校园招聘；青春有光，未来证亮。"
  },
  {
    "name": "中微公司",
    "link": "https://app.mokahr.com/campus-recruitment/amec/146254#/",
    "referral_code": "",
    "notes": "2027「登峰计划」校园招聘博士提前批。"
  },
  {
    "name": "小米",
    "link": "https://hr.xiaomi.com/campus",
    "referral_code": "",
    "notes": "2027届全球校园招聘正式启动。"
  },
  {
    "name": "得物",
    "link": "https://poizon.jobs.feishu.cn/s/f8v3mQzJYCg",
    "referral_code": "",
    "notes": "2027届校园招聘；11座城市，10大职类，2次投递机会；岗位覆盖技术、运营、产品等。"
  },
  {
    "name": "凡岛",
    "link": "https://job.fandow.com/home?pushCode=PUYBD77",
    "referral_code": "PUYBD77",
    "notes": "27校招；内推过筛offer概率高；年薪24w起；研发、产品、市场、运营、供应、IT等。"
  },
  {
    "name": "深蓝互动",
    "link": "https://app.mokahr.com/campus_apply/blueinteractive/38434?recommendCode=DS4yjqpV#/jobs",
    "referral_code": "DS4yjqpV",
    "notes": "2027秋季校园招聘；岗位：美术设计、游戏策划、技术开发、市场发行、产品支持。"
  },
  {
    "name": "帆软",
    "link": "https://t6ixa9ny16.jiandaoyun.com/f/65e1a1308ce7672fded0f0cf?ext=XDUWSK",
    "referral_code": "XDUWSK",
    "notes": "27届秋招提前批；大数据BI供应商；工作地点无锡、南京、杭州等；截止8月31日。"
  },
  {
    "name": "德州仪器",
    "link": "https://app.mokahr.com/su/yjlqkz",
    "referral_code": "",
    "notes": "2027届秋季校园招聘全面开启。"
  },
  {
    "name": "中国航空发动机集团",
    "link": "aecc.iguopin.com",
    "referral_code": "",
    "notes": "2027届校园招聘；中央直接管理的国有军工企业；招聘航空发动机工程、材料学等专业。"
  },
  {
    "name": "虎鲸文娱",
    "link": "https://campus-talent.alibaba.com/campus/index",
    "referral_code": "",
    "notes": "2027届应届生招聘正式启动。"
  },
  {
    "name": "泉峰科技",
    "link": "https://campus.chervon.com.cn",
    "referral_code": "",
    "notes": "2027届校园招聘；全面启航，下一站奔赴泉峰。"
  },
  {
    "name": "影石",
    "link": "https://arashivision.jobs.feishu.cn/s/SgQcIW_EKcs",
    "referral_code": "62MW4PZ",
    "notes": "2027届秋季校园招聘；全景相机全球市占率第一；深圳、上海、珠海；技术/产品/业务等。"
  },
  {
    "name": "普渡机器人",
    "link": "pudutech1.zhiye.com/campus/jobs",
    "referral_code": "EVVRTR",
    "notes": "27届校招；商用服务机器人市占率TOP1；深圳/成都/香港；算法、软件、硬件等。"
  },
  {
    "name": "新东方",
    "link": "https://zhaopin.xdf.cn/campus/jobs",
    "referral_code": "",
    "notes": "2027「π计划」秋季校招；全国50+城市400+岗位；整体薪资12-25w/年。"
  },
  {
    "name": "Yealink亿联网络",
    "link": "https://yealink.zhiye.com/campus/jobs",
    "referral_code": "ESKJAB",
    "notes": "2027届校园招聘提前批；全球领先沟通与协作解决方案商；研发、营销、产品类。"
  },
  {
    "name": "叠纸游戏",
    "link": "https://career.papegames.com/s/E3xzfVBWDsg",
    "referral_code": "",
    "notes": "2027秋季校园招聘；岗位涵盖技术研发、策划、美术、动画、市场运营、职能支持。"
  },
  {
    "name": "科大讯飞",
    "link": "https://iflytek.zhiye.com/campus/jobs",
    "referral_code": "ES3T3V",
    "notes": "2027届秋招；2025.6-2027.8毕业生可投；合肥/北京/上海/武汉/深圳等；最多可投两个岗位。"
  },
  {
    "name": "好未来-学而思",
    "link": "https://app.mokahr.com/campus_apply/tal/148080?recommendCode=DSsxXWDY#/jobs",
    "referral_code": "DSsxXWDY",
    "notes": "27届提前批；25-27届均可投；4000+需求；年薪15-35W+，40+城市可选。"
  },
  {
    "name": "4399游戏",
    "link": "https://hr.4399om.com/weixin/?r=job/agent&type=2&isOpen=0&jobTableType=1&code=z9mit",
    "referral_code": "z9mit",
    "notes": "2027届秋季校园招聘；产品、美术、技术、运营、职能等；选择内推网申填写专属内推码。"
  },
  {
    "name": "汇川技术",
    "link": "https://recruit.inovance.com/#/jobs?ref=APHZ76D",
    "referral_code": "APHZ76D",
    "notes": "2027届校园招聘；国产工控领军企业；技术、营销、质量、技能等；苏州/南京/深圳/上海等。"
  },
  {
    "name": "广电运通",
    "link": "https://hr.grgbanking.com/campus/",
    "referral_code": "",
    "notes": "27届校招；国有上市企业，金融科技龙头；岗位含算法、软件、硬件等；双休、六险一金。"
  },
];

// 为空间导入初始公司（仅当该空间还没有任何公司时执行，幂等）
function seedSpace(spaceId) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM companies WHERE space_id = ?').get(spaceId).n;
  if (count > 0) return { seeded: false, count: 0, reason: '已有公司，跳过' };
  const ts = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO companies (space_id, name, link, referral_code, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  let n = 0;
  for (const c of SEED_COMPANIES) {
    insert.run(
      spaceId,
      c.name,
      c.link || '',
      c.referral_code || '',
      c.notes || '',
      ts,
      ts
    );
    n++;
  }
  syncPublishedToSpace(spaceId);
  return { seeded: true, count: n };
}

// 把管理员「已发布」的公司同步到指定空间：同名公司更新资料，否则插入副本
function syncPublishedToSpace(spaceId) {
  const published = db.prepare('SELECT * FROM companies WHERE published = 1 ORDER BY id').all();
  const find = db.prepare('SELECT id FROM companies WHERE space_id = ? AND name = ?');
  const findExclude = db.prepare(
    'SELECT id FROM companies WHERE space_id = ? AND name = ? AND id <> ?'
  );
  const update = db.prepare(
    `UPDATE companies SET link = ?, referral_code = ?, notes = ?, published = 0, updated_at = ?
     WHERE id = ?`
  );
  const insert = db.prepare(
    `INSERT INTO companies (space_id, name, link, referral_code, notes, published, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  );
  let n = 0;
  const ts = new Date().toISOString();
  for (const src of published) {
    // 源公司所在空间：避免把自己更新为「未发布」，只同步同名的其他副本
    const exist =
      spaceId === src.space_id
        ? findExclude.get(spaceId, src.name, src.id)
        : find.get(spaceId, src.name);
    if (exist) {
      update.run(src.link || '', src.referral_code || '', src.notes || '', ts, exist.id);
    } else {
      insert.run(
        spaceId,
        src.name,
        src.link || '',
        src.referral_code || '',
        src.notes || '',
        src.created_at || ts,
        ts
      );
    }
    n++;
  }
  return { synced: n };
}

// 管理员发布后，把公司同步给所有用户空间（保留各自投递数据）
function syncPublishedToAllSpaces() {
  const spaces = db.prepare('SELECT id FROM spaces').all();
  let total = 0;
  for (const sp of spaces) {
    total += syncPublishedToSpace(sp.id).synced;
  }
  return { spaces: spaces.length, synced: total };
}

function seedUser(userId) {
  const space = db
    .prepare('SELECT * FROM spaces WHERE user_id = ? ORDER BY id LIMIT 1')
    .get(userId);
  return space ? seedSpace(space.id) : { seeded: false, count: 0 };
}

module.exports = {
  SEED_COMPANIES,
  seedSpace,
  seedUser,
  syncPublishedToSpace,
  syncPublishedToAllSpaces,
};
