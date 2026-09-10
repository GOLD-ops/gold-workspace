const express = require('express');
const ExcelJS = require('exceljs');
const multer = require('multer');
const db = require('../../db');
const {
  nowIso,
  todayStr,
  RESULT_META,
  applicationPublic,
  statusFromMilestoneName,
  companyPublic,
  companyDetail,
} = require('./helpers');
const { syncPublishedToAllSpaces } = require('../../seed-data');

const router = express.Router();

const COMPANY_FIELDS = ['name', 'link', 'referral_code', 'notes'];

function pickCompany(body) {
  const out = {};
  for (const f of COMPANY_FIELDS) {
    if (body[f] !== undefined) out[f] = String(body[f] ?? '');
  }
  return out;
}

// 公司列表（含各自投递），支持按公司名/岗位搜索与排序
router.get('/', (req, res) => {
  const { q = '', sort = 'updated' } = req.query;
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db
      .prepare(
        `SELECT DISTINCT c.* FROM companies c
         LEFT JOIN applications a ON a.company_id = c.id
         WHERE c.space_id = ?
           AND (c.name LIKE ? OR c.referral_code LIKE ? OR c.notes LIKE ?
                OR a.position LIKE ? OR a.department LIKE ? OR a.city LIKE ?)
         ORDER BY c.updated_at DESC, c.id DESC`
      )
      .all(req.spaceId, like, like, like, like, like, like);
  } else {
    rows = db
      .prepare('SELECT * FROM companies WHERE space_id = ? ORDER BY updated_at DESC, id DESC')
      .all(req.spaceId);
  }
  let list = rows.map(companyPublic);

  if (sort === 'company') list.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  else if (sort === 'priority')
    list.sort(
      (a, b) =>
        (b.applications.reduce((s, x) => s + x.priority_score, 0) || 0) -
          (a.applications.reduce((s, x) => s + x.priority_score, 0) || 0) ||
        (b.updated_at < a.updated_at ? -1 : 1)
    );
  else if (sort === 'created')
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  res.json(list);
});

// 导出 JSON 备份（v2：公司 + 投递 + 节点 + 笔记）
router.get('/export', (req, res) => {
  const companies = db
    .prepare('SELECT * FROM companies WHERE space_id = ? ORDER BY id')
    .all(req.spaceId);
  const applications = db
    .prepare('SELECT * FROM applications WHERE space_id = ? ORDER BY id')
    .all(req.spaceId);
  const milestones = db
    .prepare('SELECT * FROM milestones WHERE space_id = ? ORDER BY id')
    .all(req.spaceId);
  const notes = db
    .prepare('SELECT * FROM notes WHERE space_id = ? ORDER BY id')
    .all(req.spaceId);
  res.json({
    app: 'autumn-recruitment-tracker',
    version: 2,
    exported_at: nowIso(),
    companies,
    applications,
    milestones,
    notes,
  });
});

// 导出 Excel：一条投递一行，没有任何投递的公司也会占一行
router.get('/export/xlsx', async (req, res) => {
  const companies = db
    .prepare('SELECT * FROM companies WHERE space_id = ? ORDER BY updated_at DESC, id DESC')
    .all(req.spaceId);
  const apps = db
    .prepare('SELECT * FROM applications WHERE space_id = ? ORDER BY id')
    .all(req.spaceId)
    .map((a) => applicationPublic(a));
  const byCompany = new Map();
  for (const a of apps) {
    if (!byCompany.has(a.company_id)) byCompany.set(a.company_id, []);
    byCompany.get(a.company_id).push(a);
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('投递记录');
  ws.columns = [
    { header: '序号', key: 'no', width: 7 },
    { header: '公司', key: 'company', width: 22 },
    { header: '内推码', key: 'referral_code', width: 18 },
    { header: '岗位', key: 'position', width: 24 },
    { header: '城市', key: 'city', width: 12 },
    { header: '部门', key: 'department', width: 16 },
    { header: '薪资', key: 'salary', width: 14 },
    { header: '优先级', key: 'priority', width: 9 },
    { header: '当前阶段', key: 'status', width: 12 },
    { header: '进展节点', key: 'milestones', width: 46 },
    { header: '投递备注', key: 'notes', width: 32 },
    { header: '职位描述', key: 'requirements', width: 40 },
    { header: '创建时间', key: 'created_at', width: 18 },
    { header: '更新时间', key: 'updated_at', width: 18 },
  ];

  let no = 0;
  for (const c of companies) {
    const list = byCompany.get(c.id) || [];
    if (!list.length) {
      ws.addRow({
        no: ++no,
        company: c.name,
        referral_code: c.referral_code || '',
        status: '未投递',
        notes: c.notes || '',
        created_at: fmtTime(c.created_at),
        updated_at: fmtTime(c.updated_at),
      });
      continue;
    }
    for (const a of list) {
      ws.addRow({
        no: ++no,
        company: c.name,
        referral_code: c.referral_code || '',
        position: a.position || '',
        city: a.city || '',
        department: a.department || '',
        salary: a.salary || '',
        priority: a.priority || '',
        status: a.status || '',
        milestones: milestoneText(a.milestones),
        notes: a.notes || '',
        requirements: a.requirements || '',
        created_at: fmtTime(a.created_at),
        updated_at: fmtTime(a.updated_at),
      });
    }
  }

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  ws.eachRow((row) => {
    row.alignment = { wrapText: true, vertical: 'top' };
  });
  ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`秋招追踪器-${todayStr()}.xlsx`)}`
  );
  await wb.xlsx.write(res);
  res.end();
});

function fmtTime(v) {
  if (!v) return '';
  const s = String(v);
  return s.includes('T') ? s.slice(0, 16).replace('T', ' ') : s.slice(0, 10);
}

function milestoneText(milestones = []) {
  return milestones
    .map((m) => {
      const label =
        m.result && m.result !== 'none' ? (RESULT_META[m.result] && RESULT_META[m.result].label) || '' : '';
      const date = String(m.date || '').replace('T', ' ');
      return [m.name, date, label].filter(Boolean).join(' ');
    })
    .join('；');
}

// ===== Excel 导入 =====
const uploadXlsx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const XLSX_HEADER_ALIASES = {
  公司: 'company',
  公司名称: 'company',
  企业: 'company',
  company: 'company',
  内推码: 'referral_code',
  推荐码: 'referral_code',
  referral_code: 'referral_code',
  投递链接: 'link',
  官网: 'link',
  公司链接: 'link',
  岗位: 'position',
  职位: 'position',
  岗位名称: 'position',
  position: 'position',
  城市: 'city',
  地点: 'city',
  city: 'city',
  部门: 'department',
  department: 'department',
  薪资: 'salary',
  salary: 'salary',
  优先级: 'priority',
  当前阶段: 'status',
  阶段: 'status',
  状态: 'status',
  进展节点: 'milestones',
  节点: 'milestones',
  投递备注: 'notes',
  备注: 'notes',
  职位描述: 'requirements',
  岗位要求: 'requirements',
  职位要求: 'requirements',
  创建时间: 'created_at',
};

const XLSX_STATUSES = ['未投递', '已投递', '笔试', '面试', 'Offer', '已淘汰'];
const RESULT_BY_LABEL = { 待进行: 'waiting', 待结果: 'done', 通过: 'pass', 未通过: 'fail' };

function xlsxCellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())} ${p(
      value.getHours()
    )}:${p(value.getMinutes())}`;
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text || '').join('');
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    return '';
  }
  return String(value);
}

// 解析「进展节点」列，例如：投递 2026-09-10 19:49；一面 2026-09-12 14:00 待进行
function parseMilestoneText(text) {
  const labels = ['未通过', '待结果', '待进行', '通过'];
  return String(text || '')
    .split(/[；;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      let rest = seg;
      let result = '';
      for (const label of labels) {
        if (rest.endsWith(label)) {
          result = RESULT_BY_LABEL[label];
          rest = rest.slice(0, -label.length).trim();
          break;
        }
      }
      let date = '';
      const dm = rest.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
      if (dm) {
        const p = (n) => String(n).padStart(2, '0');
        date = `${dm[1]}-${p(dm[2])}-${p(dm[3])}${dm[4] ? `T${p(dm[4])}:${dm[5]}` : ''}`;
        rest = (rest.slice(0, dm.index) + rest.slice(dm.index + dm[0].length)).trim();
      }
      const name = rest.replace(/[（(]\s*[)）]/g, '').trim() || '新节点';
      return { name, result: result || 'none', date };
    });
}

// Excel → v2 结构（公司 / 投递 / 节点），再复用 /import 的写库逻辑
router.post('/import/xlsx', uploadXlsx.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择要导入的 Excel 文件' });
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ error: 'Excel 解析失败，请确认文件是 .xlsx 格式' });
  }
  const ws = wb.worksheets[0];
  if (!ws) return res.status(400).json({ error: 'Excel 中没有可读取的工作表' });

  const colMap = {};
  ws.getRow(1).eachCell((cell, colNumber) => {
    const key = XLSX_HEADER_ALIASES[xlsxCellText(cell.value).trim()];
    if (key && !colMap[key]) colMap[key] = colNumber;
  });
  if (!colMap.company) {
    return res.status(400).json({ error: 'Excel 缺少「公司」列，请参考导出的表格格式' });
  }

  const companies = [];
  const applications = [];
  const milestones = [];
  const byName = new Map();
  let companySeq = 0;
  let appSeq = 0;
  let msSeq = 0;
  let skipped = 0;

  const lastRow = Math.min(ws.rowCount, 2001);
  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const get = (key) => (colMap[key] ? xlsxCellText(row.getCell(colMap[key]).value).trim() : '');
    const name = get('company');
    if (!name) {
      skipped++;
      continue;
    }
    let company = byName.get(name);
    if (!company) {
      company = {
        id: ++companySeq,
        name,
        link: get('link'),
        referral_code: get('referral_code'),
        notes: '',
      };
      byName.set(name, company);
      companies.push(company);
    } else {
      if (!company.link) company.link = get('link');
      if (!company.referral_code) company.referral_code = get('referral_code');
    }

    const position = get('position');
    if (!position) {
      // 没有岗位的行按公司行处理，备注记到公司上
      if (!company.notes) company.notes = get('notes');
      continue;
    }

    const nodes = parseMilestoneText(get('milestones'));
    const rawStatus = get('status');
    let status = XLSX_STATUSES.includes(rawStatus) ? rawStatus : '';
    if (!status) {
      const lastName = nodes.length ? nodes[nodes.length - 1].name : '';
      status = statusFromMilestoneName(lastName) || statusFromMilestoneName(position) || '已投递';
    }
    const app = {
      id: ++appSeq,
      company_id: company.id,
      position,
      department: get('department'),
      city: get('city'),
      salary: get('salary'),
      notes: get('notes'),
      requirements: get('requirements'),
      status,
    };
    applications.push(app);
    for (const node of nodes) {
      milestones.push({ id: ++msSeq, application_id: app.id, ...node });
    }
  }

  if (!companies.length) {
    return res.status(400).json({ error: '没有读取到有效数据，请检查「公司」列是否填写' });
  }
  res.json({
    ok: true,
    summary: {
      companies: companies.length,
      applications: applications.length,
      milestones: milestones.length,
      skipped,
    },
    data: {
      app: 'autumn-recruitment-tracker',
      version: 2,
      exported_at: nowIso(),
      companies,
      applications,
      milestones,
      notes: [],
    },
  });
});

// 导入（v2 原生格式；兼容 v1：companies 含 position 等投递字段时自动拆成公司+投递）
router.post('/import', (req, res) => {
  const { mode = 'merge', data } = req.body || {};
  if (!data || !Array.isArray(data.companies)) {
    return res.status(400).json({ error: '导入数据格式不正确' });
  }
  const uid = req.spaceId;
  const tx = db.transaction(() => {
    let imported = 0;
    let merged = 0;
    let appImported = 0;

    if (mode === 'overwrite') {
      db.prepare('DELETE FROM companies WHERE space_id = ?').run(uid);
    }

    const isV1 = !Array.isArray(data.applications);
    const companyName = (c) => String(c.name || c.company || '').trim();

    const findCompany = db.prepare('SELECT * FROM companies WHERE space_id = ? AND name = ?');
    const updateCompany = db.prepare(
      `UPDATE companies SET link = ?, referral_code = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    );
    const insertCompany = db.prepare(
      `INSERT INTO companies (space_id, name, link, referral_code, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const companyIdMap = new Map();
    for (const c of data.companies) {
      const name = companyName(c);
      if (!name) continue;
      const oldId = c.id;
      let target = findCompany.get(uid, name);
      if (target) {
        updateCompany.run(
          c.link || target.link || '',
          c.referral_code || target.referral_code || '',
          c.notes !== undefined ? c.notes || '' : target.notes || '',
          nowIso(),
          target.id
        );
        merged++;
      } else {
        const r = insertCompany.run(
          uid,
          name,
          c.link || '',
          c.referral_code || '',
          c.notes || '',
          c.created_at || nowIso(),
          nowIso()
        );
        target = { id: r.lastInsertRowid };
        imported++;
      }
      if (oldId !== undefined) companyIdMap.set(oldId, target.id);
      else companyIdMap.set(name, target.id);
    }

    const findApplication = db.prepare(
      'SELECT id FROM applications WHERE company_id = ? AND position = ?'
    );
    const insertApplication = db.prepare(
      `INSERT INTO applications (company_id, space_id, position, department, city, salary, notes, requirements, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const updateApplication = db.prepare(
      `UPDATE applications SET department = ?, city = ?, salary = ?, notes = ?, requirements = ?, status = ?, updated_at = ?
       WHERE id = ?`
    );
    const appIdMap = new Map();

    if (isV1) {
      for (const c of data.companies) {
        const name = companyName(c);
        if (!name) continue;
        const companyId = companyIdMap.get(c.id) || companyIdMap.get(name);
        if (!companyId) continue;
        const r = insertApplication.run(
          companyId,
          uid,
          String(c.position || '').trim(),
          c.department || '',
          c.city || '',
          c.salary || '',
          '',
          '',
          ['未投递', '已投递', '笔试', '面试', 'Offer', '已淘汰'].includes(c.status)
            ? c.status
            : '已投递',
          c.created_at || nowIso(),
          nowIso()
        );
        appIdMap.set(c.id, r.lastInsertRowid);
        appImported++;
      }
    } else {
      for (const a of data.applications || []) {
        const companyId = companyIdMap.get(a.company_id);
        if (!companyId) continue;
        const position = String(a.position || '').trim();
        const exist = findApplication.get(companyId, position);
        if (exist) {
          updateApplication.run(
            a.department || '',
            a.city || '',
            a.salary || '',
            a.notes || '',
            a.requirements || '',
            a.status || '已投递',
            nowIso(),
            exist.id
          );
          appIdMap.set(a.id, exist.id);
        } else {
          const r = insertApplication.run(
            companyId,
            uid,
            position,
            a.department || '',
            a.city || '',
            a.salary || '',
            a.notes || '',
            a.requirements || '',
            a.status || '已投递',
            a.created_at || nowIso(),
            nowIso()
          );
          appIdMap.set(a.id, r.lastInsertRowid);
          appImported++;
        }
      }

      const insertMilestone = db.prepare(
        `INSERT INTO milestones (application_id, space_id, name, result, date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      const milestoneIdMap = new Map();
      for (const m of data.milestones || []) {
        const appId = appIdMap.get(m.application_id);
        if (!appId) continue;
        const r = insertMilestone.run(
          appId,
          uid,
          m.name || '新节点',
          m.result || 'none',
          m.date || '',
          m.created_at || nowIso()
        );
        milestoneIdMap.set(m.id, r.lastInsertRowid);
      }

      const insertNote = db.prepare(
        `INSERT INTO notes (application_id, milestone_id, space_id, title, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const n of data.notes || []) {
        const appId = appIdMap.get(n.application_id);
        if (!appId) continue;
        const newMid = n.milestone_id != null ? milestoneIdMap.get(n.milestone_id) || null : null;
        insertNote.run(
          appId,
          newMid,
          uid,
          n.title || '',
          n.content || '',
          n.created_at || nowIso(),
          n.updated_at || nowIso()
        );
      }
    }
    return { imported, merged, appImported };
  });

  const result = tx();
  res.json({ ok: true, ...result });
});

router.get('/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM companies WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  res.json(companyDetail(row));
});

// 新建公司（不创建投递；投递通过 /applications 添加）
router.post('/', (req, res) => {
  const fields = pickCompany(req.body || {});
  if (!fields.name) return res.status(400).json({ error: '公司名不能为空' });
  const ts = nowIso();
  const r = db
    .prepare(
      `INSERT INTO companies (space_id, name, link, referral_code, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.spaceId,
      fields.name,
      fields.link || '',
      fields.referral_code || '',
      fields.notes || '',
      ts,
      ts
    );
  const companyId = r.lastInsertRowid;
  res.json(companyDetail(db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId)));
});

router.put('/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM companies WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  const fields = pickCompany(req.body || {});
  if (fields.name !== undefined && !String(fields.name).trim()) {
    return res.status(400).json({ error: '公司名不能为空' });
  }
  const sets = COMPANY_FIELDS.map((f) => `${f} = ?`).join(', ');
  const vals = COMPANY_FIELDS.map((f) =>
    fields[f] !== undefined ? fields[f] : row[f] || ''
  );
  db.prepare(`UPDATE companies SET ${sets}, updated_at = ? WHERE id = ? AND space_id = ?`).run(
    ...vals,
    nowIso(),
    row.id,
    req.spaceId
  );
  if (row.published) {
    syncPublishedToAllSpaces();
  }
  res.json(companyDetail(db.prepare('SELECT * FROM companies WHERE id = ?').get(row.id)));
});

// 管理员发布/取消发布公司：发布后同步到所有用户空间
router.patch('/:id/publish', (req, res) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  const row = db
    .prepare('SELECT * FROM companies WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  const published = Number(req.body && req.body.published) ? 1 : 0;
  db.prepare('UPDATE companies SET published = ?, updated_at = ? WHERE id = ?').run(
    published,
    nowIso(),
    row.id
  );
  if (published) {
    syncPublishedToAllSpaces();
  }
  const fresh = db.prepare('SELECT * FROM companies WHERE id = ?').get(row.id);
  res.json(companyPublic(fresh));
});

router.delete('/:id', (req, res) => {
  const r = db
    .prepare('DELETE FROM companies WHERE id = ? AND space_id = ?')
    .run(req.params.id, req.spaceId);
  if (!r.changes) return res.status(404).json({ error: '记录不存在' });
  res.json({ ok: true });
});

// 清空当前空间全部记录（设置页危险操作）
router.delete('/', (req, res) => {
  const r = db.prepare('DELETE FROM companies WHERE space_id = ?').run(req.spaceId);
  res.json({ ok: true, deleted: r.changes });
});

module.exports = router;
