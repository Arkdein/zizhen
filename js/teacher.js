/* 字斟句酌 · 老师后台 — reads 报错 and 答案候选 from the teacher's Google Sheet, and writes live fixes back.
   Every call carries the passcode; the script checks it. Student text is always escaped before display. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const marked = s => esc(s).replace(/⟨([^⟩]+)⟩/g, '<span class="dot">$1</span>');
  const plainM = s => String(s || '').replace(/[⟨⟩]/g, '');
  const STRIP = /[\s，。、；;：:,.!?！？“”"'‘’「」（）()《》〈〉【】\[\]…—\-·～~]/g;
  const nrm = s => String(s || '').replace(STRIP, '');
  const pad = n => (n < 10 ? '0' : '') + n;
  const fmt = t => { if (!t) return ''; const d = new Date(t); if (isNaN(d)) return String(t); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const CFG = window.ZZ_CONFIG || {};
  const API = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(CFG.api || '') || /^http:\/\/localhost:\d+\//.test(CFG.api || '') ? CFG.api : '';
  const KK = 'zizhen-teacher-key';
  let KEY = ''; try { KEY = localStorage.getItem(KK) || sessionStorage.getItem(KK) || ''; } catch (e) { /* blocked */ }
  let D = null, tab = 'reports', show = 'open', ftext = '';

  /* ---------- built-in content, plus the fixes currently live ---------- */
  const TITLES = {}, ITEM = {}, MCQ = {}, SENTS = {};
  ZZ.ORDER.forEach(tid => {
    const T = ZZ.texts[tid]; if (!T) return;
    TITLES[tid] = T.title;
    const sents = []; T.paras.forEach(p => p.forEach(s => { let toks = []; try { toks = ZZparse(s.zh); } catch (e) { /* skip */ } sents.push({ toks, bh: s.bh }); }));
    SENTS[tid] = sents;
    (T.recall || []).forEach(r => { ITEM[r.id] = JSON.parse(JSON.stringify(Object.assign({}, r, { tid }))); });
    (T.mcq || []).forEach((q, i) => { MCQ[tid + '-mcq-' + (i + 1)] = Object.assign({ tid }, q); });
  });
  const BASE = JSON.parse(JSON.stringify(ITEM));
  function live() {
    // fresh copy of items with every active fix applied, same rules as the student app
    const I = JSON.parse(JSON.stringify(BASE)), G = {}, OFF = {};
    (D ? D.fixes : []).filter(f => f.active).forEach(f => {
      const d = f.data || {};
      if (f.type === 'gloss') G[f.target] = d;
      else if (f.type === 'off') OFF[f.target] = f;
      else { const it = I[f.target]; if (!it) return;
        if (f.type === 'ans') {
          (d.remove || []).forEach(a => ['2', '1.5', '1'].forEach(k => { it.ans[k] = (it.ans[k] || []).filter(x => nrm(x) !== nrm(a)); }));
          const k = ['2', '1.5', '1'].indexOf(String(d.tier)) >= 0 ? String(d.tier) : '2';
          (d.add || []).forEach(a => { ['2', '1.5', '1'].forEach(t2 => { it.ans[t2] = (it.ans[t2] || []).filter(x => nrm(x) !== nrm(a)); }); it.ans[k] = (it.ans[k] || []).concat([a]); });
        } else if (f.type === 'model') it.model = d.model; else if (f.type === 'note') it.note = d.note;
      }
    });
    return { I, G, OFF };
  }
  function tokAt(at) { const [tid, sid, ti] = String(at).split(':'); const S = SENTS[tid] && SENTS[tid][+sid]; return S ? { tid, S, t: S.toks[+ti], ti: +ti } : null; }
  function sentDot(S, ti) { return S.toks.map((t, i) => i === ti ? '<span class="dot">' + esc(t.w) + '</span>' : esc(t.w)).join(''); }
  const tiers = it => ['2', '1.5', '1'].filter(k => (it.ans[k] || []).length).map(k => k + ' 分：' + it.ans[k].join(' ／ ')).join('　');

  /* ---------- talking to the script ---------- */
  async function call(p) {
    const r = await fetch(API, { method: 'POST', body: JSON.stringify(Object.assign({ kind: 'admin', key: KEY }, p)) });
    return r.json();
  }
  function toast(t, ms) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms || 2400); }
  async function load(quiet) {
    if (!quiet) $('#main').innerHTML = '<p class="t-empty">正在读取……</p>';
    try {
      const j = await call({ op: 'read' });
      if (!j.ok) { if (/passcode/.test(j.error || '')) { forget(); login(j.error === 'wrong passcode' ? '密码不对，请再试一次。' : '脚本里还没有设定密码（PASSCODE）。'); } else $('#main').innerHTML = '<p class="msg err">读取失败：' + esc(j.error) + '</p>'; return; }
      D = j; D.loaded = Date.now(); $('#t-hd').hidden = false; render();
    } catch (e) { $('#main').innerHTML = '<p class="msg err">连不上 Google 表格。请检查网络，或确认 data/config.js 里的网址正确。</p>'; }
  }
  async function act(p, msg) {
    const busy = $$('.t-card button'); busy.forEach(b => { b.disabled = true; });
    try { const j = await call(p); if (!j.ok) { toast('没有成功：' + (j.error || '')); busy.forEach(b => { b.disabled = false; }); return; } toast(msg); await load(true); }
    catch (e) { toast('网络出错，请再试一次'); busy.forEach(b => { b.disabled = false; }); }
  }
  function forget() { KEY = ''; try { localStorage.removeItem(KK); sessionStorage.removeItem(KK); } catch (e) { /* ignore */ } }

  /* ---------- screens ---------- */
  function login(err) {
    $('#t-hd').hidden = true;
    if (!API) { $('#main').innerHTML = '<div class="t-login"><h1>老师后台</h1><p>还没有连接 Google 表格。设置好 Apps Script 后，把网址填进 <code>data/config.js</code>。</p></div>'; return; }
    $('#main').innerHTML = '<form class="t-login" id="t-lf"><h1>老师后台</h1><p class="fine">查看学生的报错和自评答案，修改后立即对所有学生生效。</p>' +
      (err ? '<p class="msg err">' + esc(err) + '</p>' : '') +
      '<label for="t-pw">密码</label><input type="password" id="t-pw" autocomplete="current-password" required>' +
      '<label class="radio"><input type="checkbox" id="t-rem" checked> 在这台设备上记住密码</label>' +
      '<div class="actions"><button class="btn primary" type="submit">进入</button></div></form>';
    $('#t-pw').focus();
    $('#t-lf').onsubmit = e => { e.preventDefault(); KEY = $('#t-pw').value.trim(); try { ($('#t-rem').checked ? localStorage : sessionStorage).setItem(KK, KEY); } catch (er) { /* ignore */ } load(); };
  }
  function groups() {
    const m = new Map();
    (D.cands || []).forEach(c => { const k = c.id + '|' + c.norm; if (!m.has(k)) m.set(k, { id: c.id, norm: c.norm, tid: c.tid, w: c.w, n: 0, self: {}, raws: {}, last: '' }); const g = m.get(k); g.n++; g.self[c.self] = (g.self[c.self] || 0) + 1; g.raws[c.ans] = (g.raws[c.ans] || 0) + 1; if (c.t > g.last) g.last = c.t; });
    const L = live().I;
    return [...m.values()].filter(g => { const it = L[g.id]; if (!it) return true; return !['2', '1.5', '1'].some(k => (it.ans[k] || []).some(a => nrm(a) === g.norm)); })
      .sort((a, b) => b.n - a.n || (b.last > a.last ? 1 : -1));
  }
  function render() {
    const open = D.reports.filter(r => r.status === '待处理').length, G = groups(), F = D.fixes.filter(f => f.active);
    const texts = ['', ...ZZ.ORDER.filter(t => TITLES[t])];
    let body = '';
    if (tab === 'reports') body = reportsHTML(); else if (tab === 'cands') body = candsHTML(G); else body = fixesHTML();
    $('#main').innerHTML = '<div class="t-sum" role="tablist">' +
      '<button role="tab" data-tab="reports" aria-pressed="' + (tab === 'reports') + '"><b>' + open + '</b><span>待处理的报错</span></button>' +
      '<button role="tab" data-tab="cands" aria-pressed="' + (tab === 'cands') + '"><b>' + G.length + '</b><span>答案候选</span></button>' +
      '<button role="tab" data-tab="fixes" aria-pressed="' + (tab === 'fixes') + '"><b>' + F.length + '</b><span>已生效的修改</span></button></div>' +
      '<div class="t-bar"><label>课文 <select id="t-ft">' + texts.map(t => '<option value="' + t + '"' + (t === ftext ? ' selected' : '') + '>' + (t ? '《' + esc(TITLES[t]) + '》' : '全部') + '</option>').join('') + '</select></label>' +
      (tab === 'reports' ? '<label>显示 <select id="t-sh"><option value="open"' + (show === 'open' ? ' selected' : '') + '>待处理</option><option value="all"' + (show === 'all' ? ' selected' : '') + '>全部</option></select></label>' : '') +
      '<span>更新于 ' + fmt(D.loaded) + '</span></div>' + body;
    $$('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    $('#t-ft').onchange = e => { ftext = e.target.value; render(); };
    const sh = $('#t-sh'); if (sh) sh.onchange = e => { show = e.target.value; render(); };
    bind();
  }

  function reportsHTML() {
    const L = live();
    const list = D.reports.slice().reverse().filter(r => (show === 'all' || r.status === '待处理') && (!ftext || r.tid === ftext));
    if (!list.length) return '<p class="t-empty">' + (show === 'open' ? '没有待处理的报错。' : '还没有报错。') + '</p>';
    return '<p class="t-help">学生按「报错」发来的意见。可以直接修改（马上对所有学生生效），或标为不采纳。</p><div class="t-list">' + list.map(r => {
      const ref = r.ref || {}, done = r.status !== '待处理';
      let ctx = '<p class="t-s">' + esc(r.s) + '</p>', cur = '', acts = '', edits = '';
      if (ref.type === 'gloss') {
        const k = tokAt(ref.at);
        if (k && k.t) {
          const g = L.G[ref.at] || {};
          ctx = '<p class="t-s">' + sentDot(k.S, k.ti) + '</p>';
          cur = '<p class="t-kv"><b>现在的释义</b><span class="wen">' + esc(k.t.w) + '：' + esc(g.g || k.t.g) + '</span>' + ((g.n != null ? g.n : k.t.f.n) ? '<br><b>注释</b>' + esc(g.n != null ? g.n : k.t.f.n) : '') + '</p>';
          acts = '<button class="btn sm" data-open="gl-' + r.id + '">改释义</button>';
          edits += '<div class="t-edit" id="gl-' + r.id + '" hidden><label for="g-' + r.id + '">「' + esc(k.t.w) + '」在这句里的意思</label><input id="g-' + r.id + '" value="' + esc(g.g || k.t.g) + '">' +
            '<label for="n-' + r.id + '">注释（可留空）</label><input id="n-' + r.id + '" value="' + esc(g.n != null ? g.n : (k.t.f.n || '')) + '">' +
            '<div class="t-row"><button class="btn primary sm" data-gloss="' + r.id + '" data-at="' + esc(ref.at) + '" data-w="' + esc(k.t.w) + '">保存并生效</button></div></div>';
        }
      } else if (ref.type === 'item') {
        const it = L.I[ref.id];
        if (it) {
          ctx = '<p class="t-s">' + marked(it.s) + '</p><p class="t-kv"><b>出处</b>' + esc(it.src) + (it.kind === 'out' ? '（课外）' : '') + '</p>';
          cur = '<p class="t-kv"><b>参考答案</b><span class="wen">' + esc(it.model) + '</span></p><p class="t-kv"><b>可接受</b>' + esc(tiers(it)) + '</p>' + (L.OFF[ref.id] ? '<p class="t-kv"><span class="t-chip">已停用</span></p>' : '');
          acts = (r.ans ? '<button class="btn sm" data-open="an-' + r.id + '">加为可接受答案</button>' : '') + '<button class="btn sm" data-open="md-' + r.id + '">改参考答案</button>' + (L.OFF[ref.id] ? '' : '<button class="btn sm" data-off="' + esc(ref.id) + '" data-rep-id="' + r.id + '">停用此题</button>');
          if (r.ans) edits += '<div class="t-edit" id="an-' + r.id + '" hidden><label for="a-' + r.id + '">加入的答案</label><div class="t-row"><input id="a-' + r.id + '" value="' + esc(r.ans) + '"><select id="at-' + r.id + '" aria-label="给几分"><option value="2">2 分</option><option value="1.5">1.5 分</option><option value="1">1 分</option></select><button class="btn primary sm" data-addans="' + r.id + '" data-item="' + esc(ref.id) + '">保存并生效</button></div></div>';
          edits += '<div class="t-edit" id="md-' + r.id + '" hidden><label for="m-' + r.id + '">新的参考答案（学生做完题后看到的）</label><div class="t-row"><input id="m-' + r.id + '" value="' + esc(it.model) + '"><button class="btn primary sm" data-model="' + r.id + '" data-item="' + esc(ref.id) + '">保存并生效</button></div></div>';
        }
      } else if (ref.type === 'mcq') {
        const q = MCQ[ref.id];
        cur = '<p class="t-kv"><b>当前答案</b>' + esc(r.cur) + '</p>' + (r.ans ? '<p class="t-kv"><b>学生选了</b>' + esc(r.ans) + '</p>' : '') + (q ? '<p class="t-kv"><b>解析</b>' + esc(q.why) + '</p>' : '') + (L.OFF[ref.id] ? '<p class="t-kv"><span class="t-chip">已停用</span></p>' : '');
        acts = (L.OFF[ref.id] ? '' : '<button class="btn sm" data-off="' + esc(ref.id) + '" data-rep-id="' + r.id + '">停用此题</button>') + '<span class="fine">要改选项或答案，请把题号 ' + esc(ref.id) + ' 告诉 Claude。</span>';
      }
      return '<article class="t-card' + (done ? ' done' : '') + '"><div class="t-meta"><span>' + fmt(r.t) + '</span><span>《' + esc(TITLES[r.tid] || r.tid) + '》 · ' + esc(r.where) + '</span><span class="cat">' + esc(r.cat) + '</span><span class="t-chip' + (done ? (r.status === '已修改' ? ' ok' : '') : ' new') + '">' + esc(r.status) + '</span></div>' +
        ctx + cur + (r.ans && ref.type === 'item' ? '<p class="t-kv"><b>学生答案</b><span class="wen">' + esc(r.ans) + '</span></p>' : '') + (r.msg ? '<p class="t-msg">' + esc(r.msg) + '</p>' : '') + (done && r.note ? '<p class="t-kv"><b>备注</b>' + esc(r.note) + '</p>' : '') +
        '<div class="t-act">' + (done ? '<button class="btn sm ghost" data-st="' + r.id + '" data-v="待处理">改回待处理</button>' : acts + '<button class="btn sm ghost" data-st="' + r.id + '" data-v="已处理">已处理（不用改）</button><button class="btn sm ghost" data-st="' + r.id + '" data-v="不采纳">不采纳</button>') + '</div>' + (done ? '' : edits) + '</article>';
    }).join('') + '</div>';
  }

  function candsHTML(G) {
    const L = live().I;
    const list = G.filter(g => !ftext || g.tid === ftext);
    if (!list.length) return '<p class="t-empty">没有新的答案候选。学生在测验中自评、系统未收录的答案会出现在这里。</p>';
    return '<p class="t-help">学生自评、但答案库里还没有的写法，相同写法合在一起，按人数排序。加入后，以后的学生写这个答案就会自动给分。</p><div class="t-list">' + list.map((g, i) => {
      const it = L[g.id]; const raw = Object.entries(g.raws).sort((a, b) => b[1] - a[1]);
      const dist = Object.entries(g.self).sort((a, b) => b[0] - a[0]).map(([m, n]) => m + ' 分 ×' + n).join('，');
      return '<article class="t-card"><div class="t-meta"><span><span class="t-count">' + g.n + '</span>人写了</span><span>《' + esc(TITLES[g.tid] || g.tid) + '》 · ' + esc(g.w) + '</span><span>最近 ' + fmt(g.last) + '</span></div>' +
        (it ? '<p class="t-s">' + marked(it.s) + '</p><p class="t-kv"><b>出处</b>' + esc(it.src) + '</p><p class="t-kv"><b>参考答案</b><span class="wen">' + esc(it.model) + '</span></p><p class="t-kv"><b>可接受</b>' + esc(tiers(it)) + '</p>' : '<p class="t-kv">题号 ' + esc(g.id) + '（已不在题库）</p>') +
        '<p class="t-kv"><b>学生写的</b><span class="wen">' + raw.slice(0, 4).map(([a, n]) => esc(a) + (n > 1 ? ' ×' + n : '')).join('；') + '</span></p><p class="t-dist">学生自评：' + esc(dist) + '</p>' +
        (it ? '<div class="t-edit"><label for="c-' + i + '">加入答案库的写法（可修改）</label><div class="t-row"><input id="c-' + i + '" value="' + esc(raw[0][0].replace(/[。．.]+$/, '')) + '">' +
          '<button class="btn primary sm" data-cadd="' + i + '" data-tier="2">2 分</button><button class="btn sm" data-cadd="' + i + '" data-tier="1.5">1.5 分</button><button class="btn sm" data-cadd="' + i + '" data-tier="1">1 分</button>' +
          '<button class="btn sm ghost" data-crej="' + i + '">不采纳</button></div></div>' : '<div class="t-act"><button class="btn sm ghost" data-crej="' + i + '">移除</button></div>') + '</article>';
    }).join('') + '</div>';
  }

  const TYPE = { ans: '加答案', model: '改参考答案', note: '改说明', off: '停用', gloss: '改释义' };
  function fixDesc(f) {
    const d = f.data || {};
    if (f.type === 'gloss') { const k = tokAt(f.target); return (k && k.t ? '<span class="wen">' + sentDot(k.S, k.ti) + '</span><br>' : '') + '「' + esc(d.w) + '」→ ' + esc(d.g) + (d.n ? '（' + esc(d.n) + '）' : ''); }
    const it = BASE[f.target], q = MCQ[f.target];
    const where = it ? '<span class="wen">' + marked(it.s) + '</span>' : q ? '选择题 ' + esc(f.target) + '：<span class="wen">' + marked(q.s || q.q) + '</span>' : esc(f.target);
    if (f.type === 'ans') return where + '<br>加入「' + esc((d.add || []).join('／')) + '」（' + esc(d.tier) + ' 分）';
    if (f.type === 'model') return where + '<br>参考答案 → ' + esc(d.model);
    if (f.type === 'off') return where + '<br>不再出这道题';
    return where;
  }
  function fixesHTML() {
    const list = D.fixes.slice().reverse().filter(f => { if (!ftext) return true; const tid = f.type === 'gloss' ? String(f.target).split(':')[0] : (BASE[f.target] || MCQ[f.target] || {}).tid; return tid === ftext; });
    const act = D.fixes.filter(f => f.active);
    if (!list.length) return '<p class="t-empty">还没有修改。</p>';
    return '<p class="t-help">这些修改叠加在课文资料上，学生下次打开 app 时生效。撤销后立即恢复原来的内容。</p>' +
      (act.length ? '<div class="t-act" style="margin:-4px 0 14px"><button class="btn sm" id="t-copy">复制修改清单给 Claude</button><span class="fine">要把修改正式写进课文资料时，把清单发给 Claude。</span></div>' : '') +
      '<div class="t-list">' + list.map(f => '<article class="t-card' + (f.active ? '' : ' done') + '"><div class="t-meta"><span>' + fmt(f.t) + '</span><span class="cat">' + esc(TYPE[f.type] || f.type) + '</span><span class="t-chip' + (f.active ? ' ok' : '') + '">' + (f.active ? '生效中' : '已撤销 ' + fmt(f.undone)) + '</span></div><p class="t-kv">' + fixDesc(f) + '</p>' + (f.note ? '<p class="t-kv"><b>备注</b>' + esc(f.note) + '</p>' : '') +
        (f.active ? '<div class="t-act"><button class="btn sm ghost" data-undo="' + esc(f.id) + '">撤销</button></div>' : '') + '</article>').join('') + '</div>';
  }

  function bind() {
    $$('[data-open]').forEach(b => b.onclick = () => { const el = $('#' + b.dataset.open); el.hidden = !el.hidden; if (!el.hidden) { const i = $('input', el); if (i) i.focus(); } });
    $$('[data-st]').forEach(b => b.onclick = () => act({ op: 'report', ids: [b.dataset.st], status: b.dataset.v, note: '' }, b.dataset.v === '待处理' ? '已改回待处理' : '已标为' + b.dataset.v));
    $$('[data-gloss]').forEach(b => b.onclick = () => { const id = b.dataset.gloss, g = $('#g-' + id).value.trim(), n = $('#n-' + id).value.trim(); if (!g) return;
      act({ op: 'fix', fix: { type: 'gloss', target: b.dataset.at, data: { w: b.dataset.w, g, n }, note: '报错 ' + id }, reports: [id] }, '释义已修改，学生下次打开时生效'); });
    $$('[data-addans]').forEach(b => b.onclick = () => { const id = b.dataset.addans, a = $('#a-' + id).value.trim(), t = $('#at-' + id).value; if (!a) return;
      act({ op: 'fix', fix: { type: 'ans', target: b.dataset.item, data: { tier: t, add: [a] }, note: '报错 ' + id }, reports: [id] }, '已加入答案库（' + t + ' 分）'); });
    $$('[data-model]').forEach(b => b.onclick = () => { const id = b.dataset.model, m = $('#m-' + id).value.trim(); if (!m) return;
      act({ op: 'fix', fix: { type: 'model', target: b.dataset.item, data: { model: m }, note: '报错 ' + id }, reports: [id] }, '参考答案已修改'); });
    $$('[data-off]').forEach(b => b.onclick = () => act({ op: 'fix', fix: { type: 'off', target: b.dataset.off, data: {}, note: '报错 ' + b.dataset.repId }, reports: [b.dataset.repId] }, '这道题已停用'));
    const G = tab === 'cands' ? groups().filter(g => !ftext || g.tid === ftext) : [];
    $$('[data-cadd]').forEach(b => b.onclick = () => { const g = G[+b.dataset.cadd], a = $('#c-' + b.dataset.cadd).value.trim(); if (!g || !a) return;
      act({ op: 'fix', fix: { type: 'ans', target: g.id, data: { tier: b.dataset.tier, add: [a] }, note: '答案候选 ×' + g.n }, cand: { item: g.id, norm: g.norm } }, '已加入答案库（' + b.dataset.tier + ' 分）'); });
    $$('[data-crej]').forEach(b => b.onclick = () => { const g = G[+b.dataset.crej]; if (g) act({ op: 'cand', item: g.id, norm: g.norm, status: '不采纳' }, '已标为不采纳'); });
    $$('[data-undo]').forEach(b => b.onclick = () => act({ op: 'undo', id: b.dataset.undo }, '已撤销'));
    const cp = $('#t-copy'); if (cp) cp.onclick = async () => {
      const txt = '字斟句酌 · 已生效的修改（请把这些写进课文资料，然后在后台撤销）\n' + JSON.stringify(D.fixes.filter(f => f.active).map(f => ({ id: f.id, type: f.type, target: f.target, data: f.data, note: f.note })), null, 1);
      try { await navigator.clipboard.writeText(txt); toast('已复制，可以粘贴给 Claude'); } catch (e) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('已复制'); }
    };
  }

  $('#t-refresh').onclick = () => load();
  $('#t-out').onclick = () => { forget(); D = null; login(); };
  if (KEY && API) load(); else login();
})();
