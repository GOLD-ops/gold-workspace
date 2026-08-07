const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const { createWorker } = require('tesseract.js');

const OCR_MAX_PAGES = 15;
const OCR_MIN_TEXT = 80;
const TESSDATA_DIR = path.join(__dirname, 'tessdata');

let workerPromise = null;
function getOcrWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('chi_sim+eng', 1, { langPath: TESSDATA_DIR })
      .then((worker) => worker)
      .catch((e) => {
        workerPromise = null;
        throw e;
      });
  }
  return workerPromise;
}

async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const textRes = await parser.getText();
    const text = (textRes.text || '').trim();
    if (text.length >= OCR_MIN_TEXT) {
      return { text, status: 'text' };
    }
    // 文本层缺失或过少，走 OCR
    const shots = await parser.getScreenshot({ first: OCR_MAX_PAGES });
    const worker = await getOcrWorker();
    let ocr = '';
    for (const page of shots.pages || []) {
      const buf = Buffer.from(page.data);
      const { data } = await worker.recognize(buf);
      ocr += (data.text || '') + '\n';
    }
    ocr = ocr.trim();
    if (!ocr) {
      return { text: '', status: 'failed', error: '无法从 PDF 提取文本（可能为扫描版或加密）' };
    }
    return { text: ocr, status: 'ocr', truncated: true };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function extractText(buffer, filename) {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
    const text = buffer.toString('utf8').trim();
    return { text, status: 'text' };
  }
  if (lower.endsWith('.pdf')) {
    try {
      return await extractPdf(buffer);
    } catch (e) {
      return { text: '', status: 'failed', error: `PDF 解析失败：${e.message}` };
    }
  }
  return { text: '', status: 'failed', error: '不支持的文件类型，仅支持 PDF / txt / md' };
}

module.exports = { extractText, OCR_MAX_PAGES };
