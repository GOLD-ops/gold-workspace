const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const format = req.query.format === 'json' ? 'json' : 'xlsx';
  const ids = req.query.ids
    ? String(req.query.ids)
        .split(',')
        .map(Number)
        .filter(Boolean)
    : [];
  const fields = db
    .prepare(
      'SELECT field_key, label FROM literature_fields WHERE space_id = ? AND enabled = 1 ORDER BY sort, id'
    )
    .all(req.spaceId);
  let papers = db
    .prepare('SELECT * FROM literature_papers WHERE space_id = ? ORDER BY created_at, id')
    .all(req.spaceId);
  if (ids.length) papers = papers.filter((p) => ids.includes(p.id));
  const rows = papers.map((p) => {
    const values = {};
    const analyses = db
      .prepare('SELECT field_key, value FROM literature_analyses WHERE paper_id = ?')
      .all(p.id);
    for (const a of analyses) values[a.field_key] = a.value;
    return { filename: p.filename, status: p.status, values };
  });

  if (format === 'json') {
    res.json({ fields, rows });
    return;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('文献分析');
  ws.columns = [
    { header: '序号', key: 'no', width: 8 },
    { header: '文件名', key: 'filename', width: 32 },
    ...fields.map((f) => ({ header: f.label, key: f.field_key, width: 32 })),
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };
  for (const [idx, r] of rows.entries()) {
    const row = { no: idx + 1, filename: r.filename, ...r.values };
    ws.addRow(row);
  }
  ws.eachRow((row) => {
    row.alignment = { wrapText: true, vertical: 'top' };
  });
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent('文献分析结果.xlsx')}`
  );
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
