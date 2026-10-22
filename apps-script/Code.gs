/**
 * 字斟句酌 · Google Apps Script backend
 *
 * Students' app (anonymous, no names):
 *   POST {kind:'report', ...}   a 报错 report          → sheet 报错
 *   POST {kind:'cand', items}   self-marked answers    → sheet 答案候选
 *   GET  ?a=fixes               the live fixes the app applies on top of its built-in content
 * The teacher dashboard is a Claude artifact that reads and writes this spreadsheet through the teacher's own
 * Google Sheets connection, so this script has no admin endpoints and needs no password.
 *
 * Setup: apps-script/README.md. After editing this file: Deploy → Manage deployments → ✎ → Version: New version → Deploy.
 */

const R_SHEET = '报错', C_SHEET = '答案候选', F_SHEET = '修改';
const R_HEADERS = ['时间', '编号', '位置', '课文', '字词', '句子', '当前内容', '学生答案', '问题类别', '学生说明', '状态', '老师备注', '处理时间', '定位', '版本'];
const C_HEADERS = ['时间', '题号', '课文', '字词', '学生答案', '规范化', '自评分', '状态', '处理时间'];
const F_HEADERS = ['编号', '时间', '类型', '目标', '内容', '说明', '生效', '撤销时间'];
const MAX = 600;            // longest text accepted from a student field
const MAX_BATCH = 40;       // most candidate answers in one POST

/* ------------------------------------------------------------------ entry points */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.a === 'fixes') return json_(fixes_());
  return json_({ ok: true, app: '字斟句酌' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.kind === 'report') return json_(report_(d));
    if (d.kind === 'cand') return json_(cand_(d));
    return json_({ ok: false, error: 'unknown kind' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Optional: creates the three tabs if they are missing (the dashboard set-up already made them). */
function setup() {
  sheet_(R_SHEET, R_HEADERS); sheet_(C_SHEET, C_HEADERS); sheet_(F_SHEET, F_HEADERS);
}

/* ------------------------------------------------------------------ students → sheet */

function report_(d) {
  const sh = sheet_(R_SHEET, R_HEADERS);
  const id = Utilities.getUuid().slice(0, 8);
  sh.appendRow(rowFor_(sh, {
    '时间': new Date(), '编号': id, '位置': t_(d.where, 20), '课文': t_(d.tid, 20), '字词': t_(d.w, 20),
    '句子': t_(d.s), '当前内容': t_(d.cur), '学生答案': t_(d.ans, 100), '问题类别': t_(d.cat, 30), '学生说明': t_(d.msg),
    '状态': '待处理', '定位': t_(JSON.stringify(d.ref || {}), 300), '版本': t_(d.v, 30),
  }));
  return { ok: true, id: id };
}

function cand_(d) {
  const items = Array.isArray(d.items) ? d.items.slice(0, MAX_BATCH) : [];
  if (!items.length) return { ok: false, error: 'no items' };
  const sh = sheet_(C_SHEET, C_HEADERS);
  const rows = items.filter(x => x && x.id && x.ans).map(x => rowFor_(sh, {
    '时间': new Date(), '题号': t_(x.id, 40), '课文': t_(x.tid, 20), '字词': t_(x.w, 20), '学生答案': t_(x.ans, 100),
    '规范化': t_(x.norm, 100), '自评分': Number(x.self) || 0, '状态': '待处理',
  }));
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true, n: rows.length };
}

/** Active fixes, read by every student's app when it opens. */
function fixes_() {
  const sh = sheet_(F_SHEET, F_HEADERS);
  const out = [];
  records_(sh).forEach(r => {
    if (r['生效'] !== true && String(r['生效']).toUpperCase() !== 'TRUE') return;
    let data = {}; try { data = JSON.parse(r['内容'] || '{}'); } catch (e) { return; }
    out.push({ id: String(r['编号']), type: String(r['类型']), target: String(r['目标']), data: data });
  });
  return { ok: true, fixes: out };
}

/* ------------------------------------------------------------------ helpers */

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); sh.getRange(1, 1, 1, headers.length).setFontWeight('bold'); }
  return sh;
}
function headers_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); }
function rowFor_(sh, o) { return headers_(sh).map(h => (o[h] === undefined ? '' : o[h])); }
function records_(sh) {
  const v = sh.getDataRange().getValues(); if (v.length < 2) return [];
  const H = v[0].map(String);
  return v.slice(1).map(row => { const o = {}; H.forEach((h, i) => { o[h] = row[i]; }); return o; });
}
function t_(s, n) { s = s == null ? '' : String(s); s = s.slice(0, n || MAX); return /^[=+\-@]/.test(s) ? "'" + s : s; }   // no formula injection
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
