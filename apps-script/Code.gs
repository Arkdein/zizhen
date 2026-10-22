/**
 * 字斟句酌 · Google Apps Script backend
 *
 * Students' app (anonymous, no names):
 *   POST {kind:'report', ...}   a 报错 report          → sheet 报错
 *   POST {kind:'cand', items}   self-marked answers    → sheet 答案候选
 *   GET  ?a=fixes               the live fixes the app applies on top of its built-in content
 * Teacher dashboard (teacher.html), every call carries the passcode:
 *   POST {kind:'admin', key, op:'read' | 'fix' | 'undo' | 'report' | 'cand'}
 *
 * Setup: apps-script/README.md. After editing this file: Deploy → Manage deployments → ✎ → Version: New version → Deploy.
 */

const PASSCODE = '';   // ← type your dashboard passcode between the quotes (at least 6 characters), then save and deploy

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
    if (d.kind === 'admin') return json_(admin_(d));
    return json_({ ok: false, error: 'unknown kind' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Run once after pasting (choose "setup" in the toolbar, then ▶ Run): creates the three tabs and asks for permission. */
function setup() {
  sheet_(R_SHEET, R_HEADERS); sheet_(C_SHEET, C_HEADERS); sheet_(F_SHEET, F_HEADERS);
  if (!PASSCODE || PASSCODE.length < 6) throw new Error('Set PASSCODE (at least 6 characters) at the top of the file first.');
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

/* ------------------------------------------------------------------ teacher dashboard */

function admin_(d) {
  if (!PASSCODE || PASSCODE.length < 6) return { ok: false, error: 'PASSCODE not set in the script' };
  if (String(d.key || '') !== PASSCODE) { Utilities.sleep(800); return { ok: false, error: 'wrong passcode' }; }
  const op = d.op;
  if (op === 'read') return read_();
  if (op === 'fix') return addFix_(d);
  if (op === 'undo') return undo_(String(d.id || ''));
  if (op === 'report') return setReports_(d.ids || [], String(d.status || ''), String(d.note || ''));
  if (op === 'cand') return setCands_(String(d.item || ''), String(d.norm || ''), String(d.status || ''));
  return { ok: false, error: 'unknown op' };
}

function read_() {
  const R = records_(sheet_(R_SHEET, R_HEADERS)).map(r => ({
    t: iso_(r['时间']), id: String(r['编号']), where: r['位置'], tid: r['课文'], w: r['字词'], s: r['句子'], cur: r['当前内容'],
    ans: r['学生答案'], cat: r['问题类别'], msg: r['学生说明'], status: r['状态'], note: r['老师备注'], done: iso_(r['处理时间']),
    ref: safeJson_(r['定位']), v: r['版本'],
  }));
  const C = records_(sheet_(C_SHEET, C_HEADERS)).map(r => ({
    t: iso_(r['时间']), id: String(r['题号']), tid: r['课文'], w: r['字词'], ans: String(r['学生答案']), norm: String(r['规范化']),
    self: Number(r['自评分']) || 0, status: r['状态'],
  }));
  const F = records_(sheet_(F_SHEET, F_HEADERS)).map(r => ({
    id: String(r['编号']), t: iso_(r['时间']), type: r['类型'], target: r['目标'], data: safeJson_(r['内容']), note: r['说明'],
    active: r['生效'] === true || String(r['生效']).toUpperCase() === 'TRUE', undone: iso_(r['撤销时间']),
  }));
  return { ok: true, reports: R.slice(-1500), cands: C.filter(c => c.status === '待处理').slice(-4000), fixes: F };
}

function addFix_(d) {
  const f = d.fix || {};
  const types = ['ans', 'model', 'off', 'gloss', 'note'];
  if (types.indexOf(f.type) < 0 || !f.target) return { ok: false, error: 'bad fix' };
  const sh = sheet_(F_SHEET, F_HEADERS);
  const id = 'f' + Utilities.getUuid().slice(0, 7);
  sh.appendRow(rowFor_(sh, { '编号': id, '时间': new Date(), '类型': f.type, '目标': String(f.target).slice(0, 80), '内容': JSON.stringify(f.data || {}).slice(0, 4000), '说明': String(f.note || '').slice(0, 300), '生效': true }));
  if (Array.isArray(d.reports) && d.reports.length) setReports_(d.reports, '已修改', String(f.note || ''));
  if (d.cand && d.cand.item) setCands_(String(d.cand.item), String(d.cand.norm || ''), '已采纳');
  return { ok: true, id: id };
}

function undo_(id) {
  const sh = sheet_(F_SHEET, F_HEADERS), H = headers_(sh), data = sh.getDataRange().getValues();
  const ci = H.indexOf('编号');
  for (let r = 1; r < data.length; r++) if (String(data[r][ci]) === id) { setCells_(sh, r + 1, { '生效': false, '撤销时间': new Date() }); return { ok: true }; }
  return { ok: false, error: 'not found' };
}

function setReports_(ids, status, note) {
  if (['待处理', '已修改', '不采纳', '已处理'].indexOf(status) < 0) return { ok: false, error: 'bad status' };
  const sh = sheet_(R_SHEET, R_HEADERS), H = headers_(sh), data = sh.getDataRange().getValues(), ci = H.indexOf('编号');
  const want = {}; ids.forEach(i => { want[String(i)] = 1; });
  let n = 0;
  for (let r = 1; r < data.length; r++) if (want[String(data[r][ci])]) { setCells_(sh, r + 1, { '状态': status, '老师备注': note, '处理时间': status === '待处理' ? '' : new Date() }); n++; }
  return { ok: true, n: n };
}

function setCands_(item, norm, status) {
  if (['已采纳', '不采纳', '待处理'].indexOf(status) < 0) return { ok: false, error: 'bad status' };
  const sh = sheet_(C_SHEET, C_HEADERS), H = headers_(sh), data = sh.getDataRange().getValues();
  const ii = H.indexOf('题号'), ni = H.indexOf('规范化'), si = H.indexOf('状态'), ti = H.indexOf('处理时间');
  let n = 0;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][ii]) === item && String(data[r][ni]) === norm && data[r][si] !== status) {
      sh.getRange(r + 1, si + 1).setValue(status); sh.getRange(r + 1, ti + 1).setValue(new Date()); n++;
    }
  }
  return { ok: true, n: n };
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
function setCells_(sh, row, o) { const H = headers_(sh); Object.keys(o).forEach(k => { const c = H.indexOf(k) + 1; if (c) sh.getRange(row, c).setValue(o[k]); }); }
function records_(sh) {
  const v = sh.getDataRange().getValues(); if (v.length < 2) return [];
  const H = v[0].map(String);
  return v.slice(1).map(row => { const o = {}; H.forEach((h, i) => { o[h] = row[i]; }); return o; });
}
function t_(s, n) { s = s == null ? '' : String(s); s = s.slice(0, n || MAX); return /^[=+\-@]/.test(s) ? "'" + s : s; }   // no formula injection
function iso_(d) { return d instanceof Date ? d.toISOString() : (d ? String(d) : ''); }
function safeJson_(s) { try { return JSON.parse(s || '{}'); } catch (e) { return {}; } }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
