/* 字斟句酌 · 文言字词 — app engine (vanilla JS, no build step)
   Views: #home  #read  #read/<tid>[/<word>]  #mcq/<tid>  #quiz  #quiz/run  #records  #records/pdf */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => (n < 10 ? '0' : '') + n;
  const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => dstr(new Date());
  const DAY = 864e5;
  const APP_V = 'zizhen-2026-10-22f';
  const CFG = window.ZZ_CONFIG || {};
  const API = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(CFG.api || '') || /^http:\/\/localhost:\d+\//.test(CFG.api || '') ? CFG.api : '';
  const OBX = 'zizhen-outbox', FIXK = 'zizhen-fixes';
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const marked = s => esc(s).replace(/⟨([^⟩]+)⟩/g, '<span class="dot">$1</span>');
  const markedU = s => esc(s).replace(/⟨([^⟩]+)⟩/g, '<span class="u">$1</span>');
  const plainM = s => String(s || '').replace(/[⟨⟩]/g, '');
  const fmtDT = t => { const d = new Date(t); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };

  /* ================= data ================= */
  const TX = {};            // tid -> prepared text
  const ORDER = [];
  const OCC = new Map();    // word -> [{tid, sid, ti}]
  const ITEMS = [];         // recall items (with .tid)
  const ITEM = {};
  ZZ.ORDER.forEach(tid => {
    const T = ZZ.texts[tid]; if (!T) return;
    ORDER.push(tid);
    const sents = [];
    T.paras.forEach((p, pi) => p.forEach((s, si) => {
      let toks = [];
      try { toks = ZZparse(s.zh); } catch (e) { console.error(tid, e); toks = [{ w: s.zh.replace(/[\[\]|*]/g, ''), punct: true }]; }
      sents.push({ sid: sents.length, p: pi, toks, bh: s.bh || '', note: s.note || '' });
    }));
    const keys = [];
    sents.forEach(S => S.toks.forEach((t, ti) => {
      if (t.punct || !t.g) return;
      if (!OCC.has(t.w)) OCC.set(t.w, []);
      OCC.get(t.w).push({ tid, sid: S.sid, ti });
      if (t.key && T.lex && T.lex[t.w] && !keys.includes(t.w)) keys.push(t.w);
    }));
    Object.keys(T.lex || {}).forEach(k => { if (!keys.includes(k)) keys.push(k); });
    const short = T.title.length > 5 ? T.title.slice(0, 2) : T.title;
    TX[tid] = { T, tid, sents, keys, short, cite: T.citeAs || (T.author ? T.author + '《' + T.title + '》' : '《' + T.title + '》') };
    (T.recall || []).forEach(r => { r.tid = tid; ITEM[r.id] = r; if (!r.off) ITEMS.push(r); });
  });
  ORDER.forEach(tid => (TX[tid].T.mcq || []).forEach((q, i) => { q.id = tid + '-mcq-' + (i + 1); }));
  const ALLKEYS = ORDER.flatMap(tid => TX[tid].keys.map(w => tid + ':' + w));
  const plainSent = S => S.toks.map(t => t.w).join('');
  const sentWithDot = (S, ti) => S.toks.map((t, i) => i === ti ? '<span class="dot">' + esc(t.w) + '</span>' : esc(t.w)).join('');
  function firstKeyOcc(tid, w) {
    for (const S of TX[tid].sents) for (let i = 0; i < S.toks.length; i++) if (S.toks[i].w === w && S.toks[i].key) return { S, ti: i };
    for (const S of TX[tid].sents) for (let i = 0; i < S.toks.length; i++) if (S.toks[i].w === w) return { S, ti: i };
    return null;
  }

  /* ================= state ================= */
  const KEY = 'zizhen-v1';
  const DEF = () => ({ v: 1, xp: 0, days: {}, m: {}, seen: {}, log: [], badges: {}, cnt: { recall: 0, outOk: 0, mcq: 0 }, profile: { name: '', cls: '' }, lastExport: 0, todayWord: {}, prefs: { mode: 'yw', key: true, theme: 'auto', n: 10, src: 'mix', texts: [] } });
  let S = DEF();
  try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(DEF(), JSON.parse(raw)); S.prefs = Object.assign(DEF().prefs, S.prefs || {}); S.cnt = Object.assign(DEF().cnt, S.cnt || {}); } catch (e) { /* private mode */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* full or blocked */ } }
  function applyTheme() { const t = S.prefs.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
  applyTheme();

  /* ---- mastery (Leitner boxes 0–5; due intervals in days) ---- */
  const GAP = [0, 1, 2, 4, 8, 16];
  const mget = k => S.m[k] || { b: 0, n: 0, ok: 0, bad: 0, due: 0, seen: 0 };
  function level(k) { const e = S.m[k]; if (!e) return 0; if (e.b >= 3) return 3; if (e.n > 0) return 2; return e.seen ? 1 : 0; }
  const isDue = k => { const e = S.m[k]; return !!(e && e.n > 0 && e.due <= Date.now()); };
  function practise(k, ok, soft) {
    const e = Object.assign(mget(k), {});
    e.n++; if (ok) e.ok++; else e.bad++;
    if (ok) e.b = soft ? Math.max(e.b, Math.min(2, e.b + 1)) : Math.min(5, e.b + 1); else e.b = 1;
    e.due = Date.now() + GAP[e.b] * DAY - 3600e3; e.last = Date.now(); e.seen = 1;
    S.m[k] = e;
  }
  function markSeen(k) { const e = mget(k); if (!e.seen) { e.seen = 1; S.m[k] = e; return true; } return false; }
  function textMastery(tid) { const ks = TX[tid].keys; if (!ks.length) return 0; let s = 0; ks.forEach(w => { const e = S.m[tid + ':' + w]; s += e ? Math.min(e.b, 3) / 3 : 0; }); return s / ks.length; }
  const dueKeys = () => ALLKEYS.filter(isDue);

  /* ---- XP, 科举 ranks, streak, badges ---- */
  const RANKS = [['童生', 0], ['秀才', 120], ['举人', 350], ['贡士', 700], ['进士', 1200], ['探花', 1900], ['榜眼', 2800], ['状元', 4000]];
  const rankOf = xp => { let i = 0; RANKS.forEach((r, j) => { if (xp >= r[1]) i = j; }); return i; };
  function addXP(n) {
    if (!n) return;
    const t = today(); const first = !S.days[t];
    if (first) { S.days[t] = 0; n += 5; }
    const before = rankOf(S.xp); S.xp += n; const after = rankOf(S.xp);
    save(); paintHead();
    if (after > before) toast('<span class="toast-seal">' + RANKS[after][0] + '</span>恭喜晋升' + RANKS[after][0] + '！', 3200);
    checkBadges();
  }
  function bump() { const t = today(); S.days[t] = (S.days[t] || 0) + 1; }
  function streak() { let n = 0; const d = new Date(); if (!S.days[dstr(d)]) d.setDate(d.getDate() - 1); while (S.days[dstr(d)] != null) { n++; d.setDate(d.getDate() - 1); } return n; }
  const BADGES = [
    { id: 'first', n: '开卷有益', d: '第一次点读字词', seal: '开卷' },
    { id: 't-taohua', n: '桃源问津', d: '《桃花源记》考点掌握六成', seal: '问津' },
    { id: 't-zouji', n: '门庭若市', d: '《邹忌讽齐王纳谏》考点掌握六成', seal: '若市' },
    { id: 't-mashuo', n: '伯乐相马', d: '《马说》考点掌握六成', seal: '伯乐' },
    { id: 't-zongqiu', n: '信义自归', d: '《纵囚论》考点掌握六成', seal: '信义' },
    { id: 't-liujingting', n: '入筋入骨', d: '《柳敬亭说书》考点掌握六成', seal: '入骨' },
    { id: 'allread', n: '五篇通读', d: '五篇课文各点读 15 个考点', seal: '通读' },
    { id: 'mock4', n: '一字千金', d: '1(a) 模拟拿满 4 分', seal: '千金' },
    { id: 'out30', n: '触类旁通', d: '课外题拿满分 30 次', seal: '旁通' },
    { id: 'r100', n: '字斟句酌', d: '完成 100 道释义题', seal: '斟酌' },
    { id: 's3', n: '闻鸡起舞', d: '连续学习 3 天', seal: '闻鸡' },
    { id: 's7', n: '悬梁刺股', d: '连续学习 7 天', seal: '刺股' },
    { id: 'top', n: '金榜题名', d: '晋升状元', seal: '题名' },
  ];
  function checkBadges() {
    const got = id => { if (!S.badges[id]) { S.badges[id] = Date.now(); const b = BADGES.find(x => x.id === id); save(); setTimeout(() => toast('<span class="toast-seal">' + b.seal + '</span>获得徽章「' + b.n + '」', 3200), 900); } };
    if (Object.keys(S.m).some(k => S.m[k].seen)) got('first');
    ORDER.forEach(tid => { if (textMastery(tid) >= 0.6) got('t-' + tid); });
    if (ORDER.length === 5 && ORDER.every(tid => TX[tid].keys.filter(w => (S.m[tid + ':' + w] || {}).seen).length >= Math.min(15, TX[tid].keys.length))) got('allread');
    if (S.log.some(l => l.kind === 'mock' && l.score >= l.max)) got('mock4');
    if (S.cnt.outOk >= 30) got('out30');
    if (S.cnt.recall >= 100) got('r100');
    const st = streak(); if (st >= 3) got('s3'); if (st >= 7) got('s7');
    if (rankOf(S.xp) === RANKS.length - 1) got('top');
  }
  function paintHead() {
    const i = rankOf(S.xp), nx = RANKS[i + 1];
    $('#hd-rank').textContent = RANKS[i][0];
    $('#hd-xp').textContent = S.xp;
    $('#hd-bar').style.width = nx ? Math.round((S.xp - RANKS[i][1]) / (nx[1] - RANKS[i][1]) * 100) + '%' : '100%';
  }
  let toastT = 0;
  function toast(html, ms) { const t = $('#toast'); t.innerHTML = html; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms || 2200); }

  /* ================= marking (SEAB 1(a) logic) ================= */
  const STRIP = /[\s，。、；;：:,.!?！？“”"'‘’「」（）()《》〈〉【】\[\]…—\-·～~]/g;
  const nrm = s => String(s || '').replace(STRIP, '');
  const LABEL = /^(通假字?|古今异义|词类活用|一词多义|兼词|名词|动词|形容词|副词|介词|连词|助词|代词|语气词|量词|数词|用作动词|作状语|使动用法|意动用法)$/;
  function splitAns(s) { return String(s || '').split(/[\/／、；;，,。\s]+/).map(nrm).filter(Boolean); }
  function tierOf(part, item) {
    let exact = -1, near = -1;
    ['2', '1.5', '1'].forEach(k => (item.ans[k] || []).forEach(a => {
      const A = nrm(a); if (!A) return;
      if (part === A) exact = Math.max(exact, +k);
      else if (part.length > A.length && part.includes(A) && part.length - A.length <= 2) near = Math.max(near, +k);
    }));
    return exact >= 0 ? exact : near;
  }
  function autoMark(item, raw) {
    if (!nrm(raw)) return { status: 'blank', mark: 0 };
    const whole = tierOf(nrm(raw), item);
    if (whole >= 0) return { status: 'auto', mark: whole };
    let parts = splitAns(raw);
    let tiers = parts.map(p => tierOf(p, item));
    if (tiers.some(t => t >= 0)) {   // labels such as 通假字 / 同“邀” / 代词 next to a right answer are not "extra answers"
      const keep = parts.map((p, i) => tiers[i] >= 0 || !(LABEL.test(p) || /^通?同.{1,2}$/.test(p) || /^通.$/.test(p)));
      parts = parts.filter((_, i) => keep[i]); tiers = tiers.filter((_, i) => keep[i]);
    }
    const hit = tiers.filter(t => t >= 0);
    if (parts.length && hit.length === parts.length) return { status: 'auto', mark: Math.max.apply(null, hit) };
    if (hit.length) { const t = Math.max.apply(null, hit); return { status: 'multi', mark: null, tier: t, odd: parts.filter((p, i) => tiers[i] < 0) }; }
    return { status: 'check', mark: null };
  }
  const markStr = m => (m === 2 ? '2' : m === 1.5 ? '1.5' : m === 1 ? '1' : m === 0.5 ? '0.5' : m === 0.75 ? '0.75' : String(m));

  /* ================= router ================= */
  let view = 'home', sess = null, qz = null;
  function go(h) { if (location.hash === '#' + h) route(); else location.hash = h; }
  function route() {
    const parts = location.hash.replace(/^#/, '').split('/').map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
    const v = parts[0] || 'home';
    closeSheet();
    if (qz && !qz.logged && !(v === 'quiz' && parts[1] === 'run')) finishQuiz(true);
    if (v === 'quiz' && (parts[1] === 'mock' || parts[1] === 'due')) { history.replaceState(null, '', '#quiz'); view = 'quiz'; paintNav('quiz'); renderQuizSetup(parts[1]); return; }
    view = v;
    paintNav(v === 'mcq' ? 'read' : v);
    const M = $('#main');
    if (v === 'read' && parts[1] && TX[parts[1]]) renderReader(parts[1], parts[2]);
    else if (v === 'read') renderShelf();
    else if (v === 'mcq' && TX[parts[1]]) startMCQ(parts[1]);
    else if (v === 'quiz' && parts[1] === 'run' && qz) renderQuiz();
    else if (v === 'quiz') renderQuizSetup();
    else if (v === 'records' && parts[1] === 'pdf') renderReport();
    else if (v === 'records') renderRecords();
    else { view = 'home'; renderHome(); }
    M.focus({ preventScroll: true });
    if (!(v === 'read' && parts[2])) window.scrollTo(0, 0);
  }
  function paintNav(v) { $$('.nav a').forEach(a => { if (a.dataset.v === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); }
  window.addEventListener('hashchange', route);

  /* ================= 首页 ================= */
  function pickTodayWord() {
    const t = today();
    if (S.todayWord.d === t && S.todayWord.k && ALLKEYS.includes(S.todayWord.k)) return S.todayWord;
    let pool = dueKeys(); if (!pool.length) pool = ALLKEYS.filter(k => level(k) < 3); if (!pool.length) pool = ALLKEYS;
    const k = pool[hash(t + pool.length) % pool.length];
    S.todayWord = { d: t, k, done: 0 }; save();
    return S.todayWord;
  }
  function todayHTML() {
    if (!ALLKEYS.length) return '';
    const W = pickTodayWord(); const [tid, w] = W.k.split(':'); const X = TX[tid]; const L = X.T.lex[w] || {};
    const oc = firstKeyOcc(tid, w);
    const tok = oc && oc.S.toks[oc.ti];
    const reveal = W.done || W.open;
    return '<section class="today" aria-labelledby="tw-h"><div class="big' + (w.length > 1 ? ' multi' : '') + '" aria-hidden="true">' + esc(w) + '</div><div>' +
      '<p class="lbl" id="tw-h">今日一字 · 在' + esc(X.cite) + '里怎么解？</p>' +
      (oc ? '<p class="ctx">' + sentWithDot(oc.S, oc.ti) + '</p>' : '') +
      (reveal ? '<div class="ans"><b>' + esc(tok ? tok.g : (L.senses && L.senses[0].m)) + '</b>' + (L.tip ? '<div class="fine">' + esc(L.tip) + '</div>' : '') + '</div>' : '') +
      '<div class="actions">' + (W.done ? '<a class="btn sm" href="#read/' + tid + '/' + encodeURIComponent(w) + '">在课文中看</a><span class="fine" style="align-self:center">明天再来一字</span>'
        : reveal ? '<button class="btn primary sm" data-tw="1">我想对了</button><button class="btn sm" data-tw="0">没想到</button>'
          : '<button class="btn primary sm" id="tw-open">想好了，揭晓</button>') + '</div></div></section>';
  }
  function bindToday() {
    const o = $('#tw-open'); if (o) o.onclick = () => { S.todayWord.open = 1; save(); renderHome(); };
    $$('[data-tw]').forEach(b => b.onclick = () => { const ok = b.dataset.tw === '1'; practise(S.todayWord.k, ok, true); S.todayWord.done = 1; bump(); addXP(ok ? 3 : 1); renderHome(); });
  }
  function nextSteps() {
    const out = [];
    const due = dueKeys();
    if (due.length) out.push({ ic: '温', c: 'zhu', h: '#quiz/due', b: '复习到期的 ' + due.length + ' 个字词', s: '按遗忘曲线，这些字该再练一次了' });
    const unread = ORDER.filter(tid => !TX[tid].keys.some(w => (S.m[tid + ':' + w] || {}).seen));
    const started = ORDER.filter(tid => !unread.includes(tid));
    if (started.length) {
      const weak = started.map(tid => ({ tid, m: textMastery(tid) })).sort((a, b) => a.m - b.m)[0];
      if (weak.m < 0.85) out.push({ ic: '测', h: '#mcq/' + weak.tid, b: '《' + TX[weak.tid].T.title + '》测一测', s: '这篇掌握 ' + Math.round(weak.m * 100) + '%，是目前最弱的一篇' });
    }
    if (unread.length) out.push({ ic: '读', h: '#read/' + unread[0], b: '读《' + TX[unread[0]].T.title + '》', s: '点任何一个字，看它在句中的意思' });
    const lastMock = S.log.filter(l => l.kind === 'mock').pop();
    if (!lastMock || Date.now() - lastMock.t > 3 * DAY) out.push({ ic: '考', c: 'huang', h: '#quiz/mock', b: '做一次 1(a) 模拟', s: '一题课内、一题课外，共 4 分，和会考一样' });
    if (S.log.length && Date.now() - (S.lastExport || 0) > 7 * DAY) out.push({ ic: '交', h: '#records/pdf', b: '导出学习记录给老师', s: S.lastExport ? '上次导出：' + fmtDT(S.lastExport) : '还没有导出过' });
    return out.slice(0, 4);
  }
  function zhenHTML() {
    return '<div class="zhen">' + ORDER.map(tid => {
      const X = TX[tid];
      return '<div class="zhen-row"><h3><a href="#read/' + tid + '">《' + esc(X.T.title) + '》</a><small>' + Math.round(textMastery(tid) * 100) + '% · ' + X.keys.filter(w => level(tid + ':' + w) === 3).length + '/' + X.keys.length + ' 掌握</small></h3><div class="tiles">' +
        X.keys.map(w => { const k = tid + ':' + w, l = level(k); return '<button class="tile l' + l + (isDue(k) ? ' due' : '') + '" data-go="' + tid + '/' + esc(w) + '" title="' + esc(w) + ' · ' + ['未学', '读过', '练习中', '已掌握'][l] + (isDue(k) ? ' · 待复习' : '') + '">' + esc(w) + '</button>'; }).join('') + '</div></div>';
    }).join('') + '</div><div class="legend"><span><i style="background:var(--m0)"></i>未学</span><span><i style="background:var(--m1)"></i>读过</span><span><i style="background:var(--m2)"></i>练习中</span><span><i style="background:var(--m3)"></i>已掌握（连对三次）</span><span><i style="box-shadow:inset 0 0 0 2px var(--zhu)"></i>待复习</span></div>';
  }
  function renderHome() {
    const t = today(), n = S.days[t] || 0, st = streak();
    const steps = nextSteps();
    $('#main').innerHTML = '<div class="home">' +
      '<div class="span hello"><h1>' + (S.profile.name ? esc(S.profile.name) + '，' : '') + '今天斟酌哪个字？</h1><p>' + RANKS[rankOf(S.xp)][0] + ' · ' + S.xp + ' XP · 连续 ' + st + ' 天 · 今天已答 ' + n + ' 题</p></div>' +
      '<div>' + todayHTML() +
      '<h2 class="sec-h">下一步</h2><ul class="next">' + steps.map(x => '<li><a href="' + x.h + '"><span class="ic ' + (x.c || '') + '" aria-hidden="true">' + x.ic + '</span><span><b>' + esc(x.b) + '</b><span>' + esc(x.s) + '</span></span><span class="go" aria-hidden="true">›</span></a></li>').join('') + '</ul></div>' +
      '<div><h2 class="sec-h" style="margin-top:0">字阵 <small>每个格子是一个考点，点一下到课文里看</small></h2>' + zhenHTML() + '</div></div>';
    bindToday();
    $$('[data-go]').forEach(b => b.onclick = () => go('read/' + b.dataset.go.split('/').map(encodeURIComponent).join('/')));
  }

  /* ================= 读课文 ================= */
  function renderShelf() {
    $('#main').innerHTML = '<div class="col"><h1 class="pg-h">读课文</h1><p class="pg-sub">五篇指定古文。点原文里的任何一个字词，看它在这句话里的意思；带红点线的是考点，还能看一词多义。</p><ul class="shelf">' +
      ORDER.map(tid => { const X = TX[tid]; const m = textMastery(tid);
        return '<li><a href="#read/' + tid + '"><h2>' + esc(X.T.title) + '</h2><span class="by">' + esc(X.T.era) + ' · ' + esc(X.T.author) + ' · ' + X.keys.length + ' 个考点</span><span class="pct"><b>' + Math.round(m * 100) + '%</b>掌握</span><span class="mini" aria-hidden="true">' + X.keys.map(w => '<i class="l' + level(tid + ':' + w) + '"></i>').join('') + '</span></a></li>'; }).join('') +
      '</ul>' + (ORDER.length < 5 ? '<p class="fine">部分课文资料仍在整理中。</p>' : '') + '</div>';
  }
  let RD = null; // reader state {tid, cur:{sid,ti}}
  function renderReader(tid, focusWord) {
    const X = TX[tid], T = X.T, P = S.prefs;
    let html = '';
    let pcur = -1;
    X.sents.forEach(Sx => {
      if (Sx.p !== pcur) { if (pcur >= 0) html += '</p>'; html += '<p>'; pcur = Sx.p; }
      html += '<span class="sent" data-sid="' + Sx.sid + '"><span class="zh">' + Sx.toks.map((t, ti) => {
        if (t.punct || !t.g) return esc(t.w);
        return '<span class="w' + (t.key ? ' k' : '') + '" data-i="' + Sx.sid + ':' + ti + '"' + (t.key ? ' tabindex="0" role="button"' : '') + '>' + esc(t.w) + '</span>';
      }).join('') + '</span><span class="bh">' + esc(Sx.bh) + '</span>' + (Sx.note ? '<span class="sent-note">' + esc(Sx.note) + '</span>' : '') + '</span>';
    });
    html += '</p>';
    $('#main').innerHTML = '<div class="reader"><div><button class="back" data-back>‹ 全部课文</button><div class="r-head"><h1>' + esc(T.title) + '</h1><p class="by">' + esc(T.era) + ' · ' + esc(T.author) + (T.source ? ' · ' + esc(T.source) : '') + '</p><p class="intro">' + esc(T.intro) + '</p></div>' +
      '<div class="r-tools"><div class="seg" role="group" aria-label="显示方式"><button data-mode="yw">原文</button><button data-mode="dz">对照</button><button data-mode="bh">白话</button></div>' +
      '<label class="chk"><input type="checkbox" id="showkey"' + (P.key ? ' checked' : '') + '> 标出考点</label><a class="btn primary sm" href="#mcq/' + tid + '">测一测</a></div>' +
      '<div class="text wen" id="text">' + html + '</div></div><aside class="margin" id="margin" aria-live="polite"><p class="empty">点原文中的字词，这里会出现它在句中的意思、一词多义和其他课文里的用法。</p></aside></div>';
    $('[data-back]').onclick = () => go('read');
    const setMode = m => { P.mode = m; save(); const tx = $('#text'); tx.classList.remove('mode-yw', 'mode-dz', 'mode-bh'); tx.classList.add('mode-' + m); $$('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m ? 'true' : 'false')); };
    setMode(P.mode || 'yw');
    $$('.seg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
    const sk = () => { $('#text').classList.toggle('show-key', $('#showkey').checked); P.key = $('#showkey').checked; save(); };
    $('#showkey').onchange = sk; sk();
    RD = { tid, cur: null };
    const tx = $('#text');
    tx.addEventListener('click', e => { const w = e.target.closest('.w'); if (w) openWord(w.dataset.i); });
    tx.addEventListener('keydown', e => { const w = e.target.closest('.w'); if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openWord(w.dataset.i); } });
    // seen-state paint
    X.sents.forEach(Sx => Sx.toks.forEach((t, ti) => { if (t.key && (S.m[tid + ':' + t.w] || {}).seen) { const el = tx.querySelector('[data-i="' + Sx.sid + ':' + ti + '"]'); if (el) el.classList.add('seen'); } }));
    if (focusWord) {
      let at = null;
      if (/^\d+:\d+$/.test(focusWord)) at = focusWord; else { const oc = firstKeyOcc(tid, focusWord); if (oc) at = oc.S.sid + ':' + oc.ti; }
      if (at) setTimeout(() => { openWord(at); const el = tx.querySelector('[data-i="' + at + '"]'); if (el) el.scrollIntoView({ block: 'center' }); }, 30);
    }
  }
  const wide = () => window.matchMedia('(min-width: 1040px)').matches;
  function openWord(at) {
    const [sid, ti] = at.split(':').map(Number);
    const X = TX[RD.tid], Sx = X.sents[sid], t = Sx.toks[ti];
    if (!t || t.punct || !t.g) return;
    RD.cur = { sid, ti };
    $$('#text .w.on').forEach(e => e.classList.remove('on')); $$('#text .sent.on-s').forEach(e => e.classList.remove('on-s'));
    const el = $('#text [data-i="' + at + '"]'); if (el) { el.classList.add('on', 'seen'); el.closest('.sent').classList.add('on-s'); }
    if (t.key && X.T.lex[t.w]) { if (markSeen(RD.tid + ':' + t.w)) { addXP(1); } }
    const h = noteHTML(RD.tid, sid, ti);
    if (wide()) { $('#margin').innerHTML = h; bindNote($('#margin')); }
    else { const sh = $('#sheet'); sh.innerHTML = '<div class="grab"><button class="x" id="sh-x" aria-label="关闭">×</button></div>' + h; sh.hidden = false; document.body.classList.add('sheet-open'); $('#sh-x').onclick = closeSheet; bindNote(sh); if (el) { const r = el.getBoundingClientRect(); if (r.bottom > window.innerHeight * 0.4) window.scrollBy({ top: r.top - window.innerHeight * 0.22, behavior: 'smooth' }); } }
  }
  function closeSheet() { const sh = $('#sheet'); if (sh) { sh.hidden = true; sh.innerHTML = ''; } document.body.classList.remove('sheet-open'); }
  function noteHTML(tid, sid, ti) {
    const X = TX[tid], Sx = X.sents[sid], t = Sx.toks[ti];
    const L = t.key ? X.T.lex[t.w] : null;
    const k = +(t.f.k || 0);
    const py = t.f.py || (L && L.py) || '';
    const nt = t.f.n || '';
    const tag = nt.includes('：') ? nt.split('：')[0] : '';
    let h = '<div class="note"><div class="hw"><b>' + esc(t.w) + '</b>' + (py ? '<span class="py">' + esc(py) + '</span>' : '') + (tag && tag.length <= 6 ? '<span class="tag">' + esc(tag) + '</span>' : (t.key ? '<span class="tag">考点</span>' : '')) + '</div>' +
      '<p class="g"><small>在这句里</small>' + esc(t.g) + '</p>' + (nt ? '<p class="n">' + esc(nt) + '</p>' : '') +
      '<p class="in-s">' + sentWithDot(Sx, ti) + '</p><p class="in-bh">' + esc(Sx.bh) + '</p>';
    if (L && L.senses) {
      h += '<h4>一词多义</h4><ol class="senses">' + L.senses.map((s, i) => '<li class="' + (i + 1 === k ? 'here' : '') + '"><span class="m">' + esc(s.m) + '</span>' + (s.pos ? '<span class="pos">' + esc(s.pos) + '</span>' : '') + (i + 1 === k ? '<span class="pos">· 本句</span>' : '') +
        (s.ex || []).slice(0, 2).map(x => '<span class="ex">' + marked(x.s) + ' <small class="fine">' + esc(x.src) + '</small></span>').join('') + '</li>').join('') + '</ol>';
      if (L.tip) h += '<div class="tip">' + esc(L.tip) + '</div>';
    }
    const others = (OCC.get(t.w) || []).filter(o => !(o.tid === tid && o.sid === sid && o.ti === ti));
    if (others.length) {
      h += '<h4>五篇课文里的“' + esc(t.w) + '”</h4><ul class="xref">' + others.slice(0, 8).map(o => { const S2 = TX[o.tid].sents[o.sid], t2 = S2.toks[o.ti];
        return '<li><a href="#read/' + o.tid + '/' + o.sid + ':' + o.ti + '" data-x="' + o.tid + '|' + o.sid + ':' + o.ti + '"><span class="wen">' + sentWithDot(S2, o.ti) + '</span></a><br><span class="t">《' + esc(TX[o.tid].T.title) + '》</span> ' + esc(t2.g) + '</li>'; }).join('') + '</ul>' + (others.length > 8 ? '<p class="fine">还有 ' + (others.length - 8) + ' 处</p>' : '');
    }
    h += '<div class="note-nav"><button class="btn sm" data-nav="-1">‹ 上一词</button><button class="btn sm" data-nav="1">下一词 ›</button><button class="btn sm" data-nav="k">下一个考点</button></div>' +
      (API ? '<p class="rep-line"><button class="linkbtn" data-rep="gloss" data-at="' + tid + ':' + sid + ':' + ti + '">释义有问题？报错</button></p>' : '') + '</div>';
    return h;
  }
  function bindNote(root) {
    $$('[data-nav]', root).forEach(b => b.onclick = () => stepWord(b.dataset.nav));
    $$('[data-rep="gloss"]', root).forEach(b => b.onclick = () => { const [tid, sid, ti] = b.dataset.at.split(':'); const Sx = TX[tid].sents[+sid], t = Sx.toks[+ti];
      openReport({ where: '释义', tid, w: t.w, s: plainSent(Sx), cur: t.g + (t.f.n ? '（' + t.f.n + '）' : ''), ref: { type: 'gloss', at: tid + ':' + sid + ':' + ti }, cats: ['释义有误', '注释或拼音有误', '原文有错字', '其他'] }); });
    $$('[data-x]', root).forEach(a => a.onclick = e => { const [tid, at] = a.dataset.x.split('|'); if (tid === RD.tid) { e.preventDefault(); openWord(at); const el = $('#text [data-i="' + at + '"]'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } });
  }
  function stepWord(dir) {
    const X = TX[RD.tid]; const flat = [];
    X.sents.forEach(Sx => Sx.toks.forEach((t, ti) => { if (!t.punct && t.g) flat.push({ at: Sx.sid + ':' + ti, key: t.key }); }));
    let i = RD.cur ? flat.findIndex(f => f.at === RD.cur.sid + ':' + RD.cur.ti) : -1;
    if (dir === 'k') { let j = i + 1; while (j < flat.length && !flat[j].key) j++; if (j >= flat.length) { j = 0; while (j < flat.length && !flat[j].key) j++; } i = j; }
    else i = Math.max(0, Math.min(flat.length - 1, i + (+dir)));
    if (flat[i]) { openWord(flat[i].at); const el = $('#text [data-i="' + flat[i].at + '"]'); if (el && wide()) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  document.addEventListener('keydown', e => { if (view === 'read' && RD && RD.cur && !e.target.closest('input,textarea')) { if (e.key === 'ArrowRight') stepWord(1); else if (e.key === 'ArrowLeft') stepWord(-1); else if (e.key === 'Escape') closeSheet(); } });

  /* ================= 测一测 (MCQ) ================= */
  function mcqKey(tid, q) { const m = (q.s || (q.o && q.o[q.a] && q.o[q.a].s) || '').match(/⟨([^⟩]+)⟩/); return m && TX[tid].T.lex[m[1]] ? tid + ':' + m[1] : null; }
  function startMCQ(tid) {
    const all = TX[tid].T.mcq || [];
    if (!all.some(q => !q.off)) { $('#main').innerHTML = '<div class="col"><p>这篇课文的测一测题目还在整理中。</p><a class="btn" href="#read/' + tid + '">返回课文</a></div>'; return; }
    // prefer questions on weak / due words, then random
    const sc = q => { const k = mcqKey(tid, q); return (k ? (isDue(k) ? 0 : level(k) < 3 ? 1 : 2) : 1.5) + Math.random(); };
    const pick = all.map((q, i) => ({ i, q, s: sc(q) })).filter(x => !x.q.off).sort((a, b) => a.s - b.s).slice(0, Math.min(S.prefs.n || 10, all.length)).map(x => x.i);
    sess = { kind: 'mcq', tid, qs: shuffle(pick), i: 0, res: [], order: null };
    renderMCQ();
  }
  const optHTML = (q, o) => q.type === '释义' ? esc(o) : q.type === '辨析'
    ? '<span class="pair">' + o.map(x => '<span>' + marked(x.s) + ' <small>' + esc(x.src) + '</small></span>').join('') + '</span>'
    : '<span class="pair"><span>' + marked(o.s) + '</span><small style="font-size:14px;color:var(--ink-2)">' + esc(o.g) + '</small></span>';
  function renderMCQ() {
    const X = TX[sess.tid], q = X.T.mcq[sess.qs[sess.i]];
    if (!sess.order) sess.order = shuffle(q.o.map((_, i) => i));
    const done = sess.res.length > sess.i;
    const r = sess.res[sess.i];
    const stem = q.type === '释义' ? (q.q || '句中加点字的意思是') : q.q;
    $('#main').innerHTML = '<div class="qwrap"><button class="back" id="mq-back">‹ 《' + esc(X.T.title) + '》</button>' +
      '<div class="qbar"><span>测一测 · 第 ' + (sess.i + 1) + ' / ' + sess.qs.length + ' 题</span><span class="prog"><i style="width:' + (sess.i / sess.qs.length * 100) + '%"></i></span></div>' +
      '<p class="qtype">' + esc(q.type) + '题</p><p class="qstem">' + esc(stem) + '</p>' +
      (q.type === '释义' ? '<p class="qs">' + marked(q.s) + '</p><p class="qsrc">［' + esc(mcqCite(X, q.src)) + '］</p>' : '') +
      '<ul class="opts">' + sess.order.map((oi, j) => {
        let cls = ''; if (done) { if (oi === q.a) cls = ' ok'; else if (oi === r.pick) cls = ' bad'; }
        return '<li><button class="opt' + cls + '" data-o="' + oi + '"' + (done ? ' disabled' : '') + '><span class="L">' + 'ABCD'[j] + '</span>' + optHTML(q, q.o[oi]) + '</button></li>'; }).join('') + '</ul>' +
      (done ? '<div class="fb ' + (r.ok ? 'ok' : 'bad') + '" role="status"><h3>' + (r.ok ? '答对了' : '答错了，正确答案是 ' + 'ABCD'[sess.order.indexOf(q.a)]) + '</h3><p>' + esc(q.why) + '</p>' + (API ? '<p class="rep-line"><button class="linkbtn" data-rep="mcq">这题有问题？报错</button></p>' : '') + '</div><div class="actions"><button class="btn primary" id="mq-next">' + (sess.i + 1 < sess.qs.length ? '下一题' : '看结果') + '</button></div>' : '') + '</div>';
    $('#mq-back').onclick = () => go('read/' + sess.tid);
    if (!done) $$('.opt').forEach(b => b.onclick = () => {
      const pick = +b.dataset.o, ok = pick === q.a;
      sess.res.push({ ok, pick });
      const k = mcqKey(sess.tid, q); if (k) practise(k, ok);
      S.cnt.mcq++; bump(); addXP(ok ? 5 : 1); save(); renderMCQ();
      const n = $('#mq-next'); if (n) n.focus();
    });
    else {
      $('#mq-next').onclick = () => { sess.i++; sess.order = null; if (sess.i < sess.qs.length) renderMCQ(); else endMCQ(); };
      const rb = $('[data-rep="mcq"]'); if (rb) rb.onclick = () => openReport({ where: '选择题', tid: sess.tid, w: (String(q.s || q.q).match(/⟨([^⟩]+)⟩/) || [])[1] || '', s: plainM(qSummary(q)), cur: '答案：' + plainM(optPlain(q, q.o[q.a])), ans: plainM(optPlain(q, q.o[r.pick])), ref: { type: 'mcq', id: q.id, type2: q.type }, cats: ['答案有误', '选项或解析有误', '题目有错字', '其他'] });
    }
  }
  function mcqCite(X, src) { if (!src || src === X.T.title || src === X.cite) return X.cite; return /《/.test(src) ? src : '《' + src + '》'; }
  function qSummary(q) { return q.type === '释义' ? q.s : q.q; }
  function endMCQ() {
    const X = TX[sess.tid], ok = sess.res.filter(r => r.ok).length;
    const items = sess.qs.map((qi, i) => { const q = X.T.mcq[qi], r = sess.res[i]; return { type: q.type, s: qSummary(q), ok: r.ok, ans: optPlain(q, q.o[q.a]), pick: optPlain(q, q.o[r.pick]) }; });
    S.log.push({ t: Date.now(), kind: 'mcq', tid: sess.tid, score: ok, max: sess.qs.length, items });
    if (S.log.length > 400) S.log = S.log.slice(-400);
    save(); checkBadges();
    $('#main').innerHTML = '<div class="qwrap"><div class="result"><p class="fine">《' + esc(X.T.title) + '》测一测</p><div class="score">' + ok + '<small> / ' + sess.qs.length + '</small></div><p>' + (ok === sess.qs.length ? '全对。这篇的字词你已经很熟了。' : ok >= sess.qs.length * 0.7 ? '不错。错的字词已排进复习。' : '错的字词已排进复习，回课文再读一遍会更稳。') + '</p>' +
      '<div class="actions" style="justify-content:center"><a class="btn primary" href="#mcq/' + sess.tid + '">再测一组</a><a class="btn" href="#read/' + sess.tid + '">回到课文</a><a class="btn" href="#quiz">去测验</a></div></div>' +
      '<ul class="rlist">' + items.map(it => '<li><span class="s">' + marked(it.s) + '</span><span class="meta">' + esc(it.type) + ' · 正确：' + esc(it.ans) + (it.ok ? '' : ' · 你选：' + esc(it.pick)) + '</span><span class="pt' + (it.ok ? ' full' : '') + '">' + (it.ok ? '✓' : '✗') + '</span></li>').join('') + '</ul></div>';
  }
  function optPlain(q, o) { if (q.type === '释义') return o; if (q.type === '辨析') return o.map(x => x.s).join(' ／ '); return o.s + '：' + o.g; }

  /* ================= 测验 (free recall) ================= */
  const itemKey = it => it.tid + ':' + it.w;
  function renderQuizSetup(preset) {
    const P = S.prefs; const due = dueKeys();
    const tsel = P.texts && P.texts.length ? P.texts : ORDER.slice();
    const nIn = ITEMS.filter(i => i.kind === 'in').length, nOut = ITEMS.length - nIn;
    $('#main').innerHTML = '<div class="col"><h1 class="pg-h">测验</h1><p class="pg-sub">不给选项，自己写出带点字的意思，和会考 1(a) 一样。课外的句子，考的字一定出现在指定课文里，而且意思相同；每题都注明考点出自哪篇课文。</p>' +
      '<div class="modes"><section class="mode exam"><h2>1(a) 模拟</h2><p>一题课内、一题课外，每题 2 分，共 4 分。按会考评分：同义词都给分，写错字扣 0.5 分，写多个答案其中有错只得一半。</p><div class="actions"><button class="btn primary" id="go-mock">开始模拟</button></div></section>' +
      '<section class="mode"><h2>复习到期</h2><p>' + (due.length ? '有 ' + due.length + ' 个字词到了复习时间。练这些最省力。' : '目前没有到期的字词。做过的题会按遗忘曲线安排复习。') + '</p><div class="actions"><button class="btn" id="go-due"' + (due.length ? '' : ' disabled') + '>复习 ' + Math.min(due.length, 20) + ' 题</button></div></section></div>' +
      '<h2 class="sec-h">自选练习 <small>题库：课内 ' + nIn + ' 题 · 课外 ' + nOut + ' 题</small></h2>' +
      '<form id="qf"><div class="field"><span>课文</span><div class="chips">' + ORDER.map(tid => '<label><input type="checkbox" name="t" value="' + tid + '"' + (tsel.includes(tid) ? ' checked' : '') + '><span>' + esc(TX[tid].T.title) + '</span></label>').join('') + '</div></div>' +
      '<div class="field"><span>句子来源</span><div class="chips">' + [['mix', '课内＋课外'], ['in', '只要课内'], ['out', '只要课外']].map(([v, l]) => '<label><input type="radio" name="src" value="' + v + '"' + (P.src === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') + '</div></div>' +
      '<div class="field"><span>优先</span><div class="chips">' + [['weak', '没掌握的'], ['any', '随机']].map(([v, l]) => '<label><input type="radio" name="pri" value="' + v + '"' + ((P.pri || 'weak') === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') + '</div></div>' +
      '<div class="field"><span>题数</span><div class="chips">' + [5, 10, 20].map(v => '<label><input type="radio" name="n" value="' + v + '"' + (+(P.qn || 10) === v ? ' checked' : '') + '><span>' + v + ' 题</span></label>').join('') + '</div></div>' +
      '<p class="msg err" id="qf-msg" hidden></p><div class="actions"><button class="btn primary" type="submit">开始练习</button></div></form></div>';
    $('#go-mock').onclick = startMock;
    $('#go-due').onclick = startDue;
    $('#qf').onsubmit = e => {
      e.preventDefault();
      const f = e.target; const texts = $$('input[name="t"]:checked', f).map(i => i.value);
      const src = f.src.value, n = +f.n.value, pri = f.pri.value;
      Object.assign(P, { texts, src, qn: n, pri }); save();
      let pool = ITEMS.filter(i => texts.includes(i.tid) && (src === 'mix' || i.kind === src));
      if (!pool.length) { const m = $('#qf-msg'); m.hidden = false; m.textContent = '请至少选一篇课文。'; return; }
      pool = pri === 'weak' ? pool.map(i => ({ i, s: level(itemKey(i)) + (isDue(itemKey(i)) ? -1 : 0) + Math.random() * 1.5 })).sort((a, b) => a.s - b.s).map(x => x.i) : shuffle(pool);
      startQuiz('free', spread(pool, n));
    };
    if (preset === 'mock') startMock(); else if (preset === 'due') startDue();
  }
  function spread(pool, n) { const out = [], seen = new Set(); for (const it of pool) { const k = itemKey(it); if (seen.has(k) && pool.length > n * 1.5) continue; seen.add(k); out.push(it); if (out.length >= n) break; } return shuffle(out); }
  function startDue() {
    const due = new Set(dueKeys());
    const pool = shuffle(ITEMS.filter(i => due.has(itemKey(i))));
    if (!pool.length) { toast('目前没有到期的字词'); return; }
    startQuiz('due', spread(pool, 20));
  }
  function startMock() {
    const ins = ITEMS.filter(i => i.kind === 'in'), outs = ITEMS.filter(i => i.kind === 'out');
    if (!ins.length || !outs.length) { toast('题库还在整理中'); return; }
    const w = it => 1 + (3 - level(itemKey(it)));
    const pickW = arr => { const tot = arr.reduce((s, x) => s + w(x), 0); let r = Math.random() * tot; for (const x of arr) { r -= w(x); if (r <= 0) return x; } return arr[0]; };
    const a = pickW(ins); let b = pickW(outs.filter(x => x.w !== a.w)) || pickW(outs);
    startQuiz('mock', [a, b]);
  }
  function startQuiz(mode, items) {
    qz = { mode, items: items.map(i => i.id), i: 0, res: items.map(() => null), t0: Date.now(), logged: false };
    if (location.hash === '#quiz/run') renderQuiz(); else go('quiz/run');
  }
  const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi'];
  function itemBlock(it, idx, r, input) {
    const X = TX[it.tid];
    const lbl = esc(it.w) + '：';
    let h = '<div class="item"><span class="no">(' + (ROMAN[idx] || idx + 1) + ')</span><div><p class="qs">' + marked(it.s) + '</p><p class="qsrc">［' + esc(it.src) + '］' + (it.kind === 'in' ? '<span class="tag-s in">课内</span>' : '<span class="tag-s">课外</span>') + '</p>';
    if (input) h += '<div class="ansrow"><label for="a' + idx + '" class="wen">' + lbl + '</label><input id="a' + idx + '" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" value="' + esc(r && r.ans || '') + '"></div>';
    else if (r) h += '<div class="ansrow"><span class="wen" style="font-size:18px">' + lbl + esc(r.ans || '（未作答）') + '</span>' + (r.mark != null ? '<span class="mark' + (r.mark >= 2 ? ' full' : '') + '">' + markStr(r.mark) + '</span>' : '') + '</div>';
    h += '</div></div>';
    return h;
  }
  function fbBlock(it, idx, r) {
    const X = TX[it.tid];
    if (!r) return '';
    let h = '';
    if (r.mark == null) {
      const acc = (it.ans['2'] || []).join(' ／ ');
      h += '<div class="fb" role="status"><h3>这个答案需要你自己对照</h3><p>参考答案：<span class="model">' + esc(it.model) + '</span></p>' + (acc ? '<p class="acc">可得满分的写法：' + esc(acc) + '</p>' : '') + (it.note ? '<p class="acc">' + esc(it.note) + '</p>' : '');
      if (r.status === 'multi') {
        const t = r.tier, odd = r.odd.join('、');
        h += '<p>你写了多个答案，其中「' + esc(odd) + '」不在参考答案里。按会考评分，多个答案中有错的只给一半分数。</p><div class="selfmark">' +
          '<button data-self="' + idx + '" data-m="' + t + '"><b>' + markStr(t) + ' 分</b>「' + esc(odd) + '」意思也对</button>' +
          '<button data-self="' + idx + '" data-m="' + (t / 2) + '"><b>' + markStr(t / 2) + ' 分</b>「' + esc(odd) + '」意思不对</button></div>';
      } else {
        h += '<div class="selfmark">' +
          '<button data-self="' + idx + '" data-m="2"><b>2 分</b>意思和参考答案相同（同义词也算）</button>' +
          '<button data-self="' + idx + '" data-m="1.5"><b>1.5 分</b>意思对，但多写了无关内容或写错一个字</button>' +
          '<button data-self="' + idx + '" data-m="1"><b>1 分</b>只答对了一部分，或说得太笼统</button>' +
          '<button data-self="' + idx + '" data-m="0"><b>0 分</b>意思不对</button></div>';
      }
      h += '<p class="rule-note">自评的题会在学习记录里标出，老师可以复核。' + (API ? '你的答案和自评分也会匿名发给老师，用来完善答案库。' : '') + '</p>' + (API ? '<p class="rep-line"><button class="linkbtn" data-rep="item" data-idx="' + idx + '">参考答案有问题？报错</button></p>' : '') + '</div>';
      return h;
    }
    const full = r.mark >= 2;
    h += '<div class="fb ' + (full ? 'ok' : 'bad') + '" role="status"><h3>' + (r.status === 'blank' ? '没有作答' : full ? '满分' : '得 ' + markStr(r.mark) + ' 分') + (r.how === 'self' ? '（自评）' : '') + '</h3>' +
      '<p>参考答案：<span class="model">' + esc(it.model) + '</span></p>' +
      ((it.ans['1.5'] || []).length || (it.ans['1'] || []).length ? '<p class="acc">' + ((it.ans['1.5'] || []).length ? '1.5 分：' + esc(it.ans['1.5'].join(' ／ ')) + '　' : '') + ((it.ans['1'] || []).length ? '1 分：' + esc(it.ans['1'].join(' ／ ')) : '') + '</p>' : '') +
      (it.note ? '<p>' + esc(it.note) + '</p>' : '') +
      '<p class="link">考点出自' + esc(X.cite) + '：<span class="wen">' + marked(it.link) + '</span>' + (it.kind === 'out' ? '　本句出自 ' + esc(it.src) + '（课外）' : '') + '　<a href="#read/' + it.tid + '/' + encodeURIComponent(it.w) + '">到课文里看</a></p>' + (API ? '<p class="rep-line"><button class="linkbtn" data-rep="item" data-idx="' + idx + '">' + (full ? '这题有问题？报错' : '我的答案也应该算对？报错') + '</button></p>' : '') + '</div>';
    return h;
  }
  function resolve(idx, mark, how) {
    const it = ITEM[qz.items[idx]], r = qz.res[idx];
    r.mark = mark; r.how = how;
    practise(itemKey(it), mark >= 1.5);
    S.cnt.recall++; if (it.kind === 'out' && mark >= 2) S.cnt.outOk++;
    if (how === 'self' && r.ans) queueCand({ id: it.id, tid: it.tid, w: it.w, ans: r.ans.slice(0, 100), norm: nrm(r.ans).slice(0, 100), self: mark });
    bump(); addXP(Math.round(mark * 5) || 1); save();
  }
  function renderQuiz() {
    if (!qz) { go('quiz'); return; }
    const mock = qz.mode === 'mock';
    const ttl = mock ? '1(a) 模拟' : qz.mode === 'due' ? '复习到期' : '自选练习';
    let body = '';
    if (mock) {
      const answered = qz.res.every(r => r);
      body = '<div class="paper"><p class="ins">1 (a) 解释带点字的意思（每题 2 分，共 4 分）</p>' + qz.items.map((id, i) => itemBlock(ITEM[id], i, qz.res[i], !answered) + (answered ? fbBlock(ITEM[id], i, qz.res[i]) : '')).join('') +
        (answered ? '' : '<div class="actions"><button class="btn primary" id="qz-sub">交卷</button></div>') + '</div>';
      if (answered && qz.res.every(r => r.mark != null)) { const sc = qz.res.reduce((s, r) => s + r.mark, 0); body += '<div class="result"><div class="score">' + markStr(sc) + '<small> / 4</small></div><p>' + (sc >= 4 ? '满分，一字千金！' : sc >= 3 ? '接近满分，看看扣分的那一题差在哪里。' : '扣分的字词已排进复习。') + '</p><div class="actions" style="justify-content:center"><button class="btn primary" id="qz-again">再来一份</button><a class="btn" href="#quiz">返回测验</a></div></div>'; finishQuiz(); }
    } else {
      const it = ITEM[qz.items[qz.i]], r = qz.res[qz.i];
      body = '<div class="qbar"><span>' + ttl + ' · 第 ' + (qz.i + 1) + ' / ' + qz.items.length + ' 题</span><span class="prog"><i style="width:' + (qz.i / qz.items.length * 100) + '%"></i></span></div>' +
        '<div class="paper single"><p class="ins">解释带点字的意思（2 分）</p>' + itemBlock(it, qz.i, r, !r) + (r ? fbBlock(it, qz.i, r) : '<div class="actions"><button class="btn primary" id="qz-sub">提交</button><button class="btn ghost" id="qz-skip">不会，看答案</button></div>') + '</div>' +
        (r && r.mark != null ? '<div class="actions"><button class="btn primary" id="qz-next">' + (qz.i + 1 < qz.items.length ? '下一题' : '看结果') + '</button></div>' : '');
    }
    $('#main').innerHTML = '<div class="qwrap"><button class="back" id="qz-back">‹ 测验</button><h1 class="pg-h" style="font-size:22px;margin-bottom:14px">' + ttl + '</h1>' + body + '</div>';
    $('#qz-back').onclick = () => go('quiz');
    const sub = $('#qz-sub');
    if (sub) {
      const doSubmit = () => {
        const idxs = mock ? qz.items.map((_, i) => i) : [qz.i];
        if (mock && idxs.some(i => !$('#a' + i).value.trim()) && !confirmBlank()) return;
        idxs.forEach(i => {
          const it = ITEM[qz.items[i]], ans = $('#a' + i).value.trim();
          const m = autoMark(it, ans);
          qz.res[i] = Object.assign({ ans, how: 'auto' }, m);
          if (m.mark != null) resolve(i, m.mark, m.status === 'blank' ? 'blank' : 'auto');
        });
        renderQuiz(); focusFb();
      };
      sub.onclick = doSubmit;
      $$('.ansrow input').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const nx = $('#a' + (+inp.id.slice(1) + 1)); if (mock && nx && !nx.value) nx.focus(); else doSubmit(); } }));
      const first = $('.ansrow input'); if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
    }
    const sk = $('#qz-skip'); if (sk) sk.onclick = () => { qz.res[qz.i] = { ans: '', status: 'blank', mark: 0, how: 'blank' }; resolve(qz.i, 0, 'blank'); renderQuiz(); };
    $$('[data-self]').forEach(b => b.onclick = () => { resolve(+b.dataset.self, +b.dataset.m, 'self'); renderQuiz(); focusFb(); });
    $$('[data-rep="item"]').forEach(b => b.onclick = () => { const i = +b.dataset.idx, it = ITEM[qz.items[i]], r = qz.res[i] || {};
      openReport({ where: '测验题', tid: it.tid, w: it.w, s: plainM(it.s), cur: '参考答案：' + it.model + '；满分写法：' + (it.ans['2'] || []).join('／'), ans: r.ans || '', ref: { type: 'item', id: it.id, src: it.src },
        cats: r.mark != null && r.mark < 2 ? ['我的答案也应该算对', '参考答案有误', '句子或出处有误', '其他'] : ['参考答案有误', '我的答案也应该算对', '句子或出处有误', '其他'] }); });
    const nx = $('#qz-next'); if (nx) { nx.onclick = () => { if (qz.i + 1 < qz.items.length) { qz.i++; renderQuiz(); } else { finishQuiz(); renderQuizResult(); } }; }
    const ag = $('#qz-again'); if (ag) ag.onclick = startMock;
  }
  let blankOK = false;
  function confirmBlank() { if (blankOK) { blankOK = false; return true; } blankOK = true; toast('还有题没写。再按一次「交卷」就提交。', 2600); return false; }
  function focusFb() { const f = $('.fb'); if (f) { f.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); const b = $('[data-self]') || $('#qz-next'); if (b) b.focus({ preventScroll: true }); } }
  function finishQuiz(partial) {
    if (qz.logged) return;
    const doneIdx = qz.items.map((_, i) => i).filter(i => qz.res[i] && qz.res[i].mark != null);
    if (partial ? !doneIdx.length : doneIdx.length < qz.items.length) return;
    qz.logged = true;
    const items = doneIdx.map(i => { const id = qz.items[i], it = ITEM[id], r = qz.res[i]; return { id, tid: it.tid, kind: it.kind, s: it.s, src: it.src, w: it.w, ans: r.ans, mark: r.mark, how: r.how, model: it.model }; });
    const score = items.reduce((s, x) => s + x.mark, 0);
    S.log.push({ t: Date.now(), kind: qz.mode === 'mock' ? 'mock' : 'quiz', score, max: items.length * 2, items, partial: partial ? 1 : 0 });
    if (qz.mode === 'mock' && score >= 4 && !partial) addXP(10);
    if (S.log.length > 400) S.log = S.log.slice(-400);
    save(); checkBadges();
  }
  function renderQuizResult() {
    const items = qz.items.map((id, i) => ({ it: ITEM[id], r: qz.res[i] }));
    const sc = items.reduce((s, x) => s + x.r.mark, 0), max = items.length * 2;
    $('#main').innerHTML = '<div class="qwrap"><div class="result"><p class="fine">' + (qz.mode === 'due' ? '复习到期' : '自选练习') + '</p><div class="score">' + markStr(sc) + '<small> / ' + max + '</small></div><p>得分率 ' + Math.round(sc / max * 100) + '%' + (items.some(x => x.r.how === 'self') ? ' · 含自评题' : '') + '</p>' +
      '<div class="actions" style="justify-content:center"><a class="btn primary" href="#quiz">再练一组</a><a class="btn" href="#home">回首页</a></div></div>' +
      '<ul class="rlist">' + items.map(x => '<li><span class="s">' + marked(x.it.s) + '</span><span class="meta">' + esc(x.it.src) + ' · 你答：' + esc(x.r.ans || '（未作答）') + ' · 参考：' + esc(x.it.model) + (x.r.how === 'self' ? ' · 自评' : '') + '</span><span class="pt' + (x.r.mark >= 2 ? ' full' : '') + '">' + markStr(x.r.mark) + '</span></li>').join('') + '</ul></div>';
  }

  /* ================= 记录 ================= */
  function renderRecords() {
    const i = rankOf(S.xp), nx = RANKS[i + 1];
    const rec = S.log.filter(l => l.kind !== 'mcq'); const rs = rec.reduce((a, l) => [a[0] + l.score, a[1] + l.max], [0, 0]);
    const mastered = ALLKEYS.filter(k => level(k) === 3).length;
    $('#main').innerHTML = '<div class="col"><h1 class="pg-h">记录</h1><p class="pg-sub">你的等级、徽章和每一次练习。进度只保存在这台设备的浏览器里；要交给老师，就导出 PDF。</p>' +
      '<section class="rankcard"><div class="bigseal" aria-hidden="true">' + RANKS[i][0].split('').map(c => '<span>' + c + '</span>').join('') + '</div><div><h2>' + RANKS[i][0] + '</h2><p>' + S.xp + ' XP' + (nx ? ' · 再得 ' + (nx[1] - S.xp) + ' XP 晋升' + nx[0] : ' · 已登科举之巅') + '</p><div class="ladder" aria-label="科举等级">' + RANKS.map((r, j) => '<span class="' + (j < i ? 'got' : j === i ? 'cur' : '') + '" title="' + r[0] + ' · ' + r[1] + ' XP">' + r[0] + '</span>').join('') + '</div></div></section>' +
      '<div class="stats"><div><b>' + streak() + '</b><span>连续学习天数</span></div><div><b>' + Object.keys(S.days).length + '</b><span>累计学习天数</span></div><div><b>' + mastered + '<small style="font-size:14px;color:var(--ink-3)"> / ' + ALLKEYS.length + '</small></b><span>已掌握考点</span></div><div><b>' + S.cnt.recall + '</b><span>释义题（测验）</span></div><div><b>' + (rs[1] ? Math.round(rs[0] / rs[1] * 100) + '%' : '—') + '</b><span>测验得分率</span></div><div><b>' + S.cnt.mcq + '</b><span>测一测选择题</span></div></div>' +
      '<h2 class="sec-h">徽章 <small>' + Object.keys(S.badges).length + ' / ' + BADGES.length + '</small></h2><div class="badges">' + BADGES.map(b => '<div class="badge' + (S.badges[b.id] ? ' got' : '') + '"><span class="bs" aria-hidden="true">' + b.seal + '</span><span><b>' + b.n + '</b><small>' + esc(b.d) + '</small></span></div>').join('') + '</div>' +
      '<h2 class="sec-h">交给老师</h2><p>把练习记录生成 PDF，用电邮发给老师。</p><div class="actions"><a class="btn primary" href="#records/pdf">导出学习记录 PDF</a></div>' +
      '<h2 class="sec-h">练习历史 <small>最近 40 次</small></h2>' + histHTML() +
      '<h2 class="sec-h">设置</h2><fieldset><legend>外观</legend>' + [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([v, l]) => '<label class="radio"><input type="radio" name="th" value="' + v + '"' + (S.prefs.theme === v ? ' checked' : '') + '>' + l + '</label>').join('') + '</fieldset>' +
      '<div class="field"><span>姓名与班级（只用在 PDF 上）</span><div class="form-row"><label for="pf-n">姓名</label><input id="pf-n" value="' + esc(S.profile.name) + '"><label for="pf-c">班级</label><input id="pf-c" value="' + esc(S.profile.cls) + '"></div></div>' +
      '<div class="actions"><button class="btn ghost danger" id="rs">清除这台设备上的全部进度</button></div><div id="rs-z"></div>' +
      '<h2 class="sec-h">关于</h2><p class="fine">课文版本与释义以本校华文部《学习单》（教师版）、白话注释与练习答案为准，并参考《古汉语常用字字典》、教材注释、汉典与古诗文网。测验仿新加坡剑桥 A 水准 H2 华文与文学（9575）试卷三 A组 1(a)；评分方式参照 2022—2025 年评分指引。课外例句均已核对出处。发现错误，请告诉老师。' + (API ? '按「报错」发送的意见，以及测验中自评的答案，会匿名发送给老师（不含姓名和班级），用来改进释义和答案库。' : '') + '</p></div>';
    $$('input[name="th"]').forEach(r => r.onchange = () => { S.prefs.theme = r.value; save(); applyTheme(); });
    $('#pf-n').onchange = $('#pf-c').onchange = () => { S.profile.name = $('#pf-n').value.trim(); S.profile.cls = $('#pf-c').value.trim(); save(); };
    $('#rs').onclick = () => { $('#rs-z').innerHTML = '<div class="msg err"><p>确定清除？等级、徽章和全部记录都会删除，无法恢复。建议先导出 PDF。</p><div class="actions"><button class="btn" id="rs-n">取消</button><button class="btn zhu" id="rs-y">清除</button></div></div>'; $('#rs-n').onclick = () => { $('#rs-z').innerHTML = ''; }; $('#rs-y').onclick = () => { const keep = { profile: S.profile, prefs: S.prefs }; S = Object.assign(DEF(), keep); save(); paintHead(); renderRecords(); toast('进度已清除'); }; };
  }
  const KIND = { mcq: '测一测', quiz: '测验', mock: '1(a) 模拟' };
  function histHTML() {
    const L = S.log.slice(-40).reverse();
    if (!L.length) return '<p class="fine">还没有练习记录。去<a href="#read">读课文</a>或<a href="#quiz">做测验</a>吧。</p>';
    return '<ul class="hist">' + L.map(l => '<li><details><summary><b>' + KIND[l.kind] + (l.tid ? '《' + esc(TX[l.tid] ? TX[l.tid].T.title : l.tid) + '》' : '') + '</b><span>' + fmtDT(l.t) + ' · ' + l.items.length + ' 题</span><span class="sc">' + markStr(l.score) + '/' + l.max + '</span></summary><div class="det">' +
      l.items.map(x => l.kind === 'mcq' ? '<p>' + (x.ok ? '✓' : '✗') + ' <span class="wen">' + marked(x.s) + '</span> — ' + marked(x.ans) + '</p>' : '<p><span class="wen">' + marked(x.s) + '</span> ［' + esc(x.src) + '］<br>你答：' + esc(x.ans || '—') + ' · ' + markStr(x.mark) + ' 分' + (x.how === 'self' ? '（自评）' : '') + ' · 参考：' + esc(x.model) + '</p>').join('') + '</div></details></li>').join('') + '</ul>';
  }

  /* ---------------- PDF report ---------------- */
  const LIBS = ['js/vendor/html2canvas.min.js', 'js/vendor/jspdf.umd.min.js'];  // html2canvas 1.4.1 + jsPDF 2.5.1 (MIT), bundled so school networks can't block them
  function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector('script[src="' + src + '"]')) return res(); const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('load')); document.head.appendChild(el); }); }
  function rangeFrom(r) { return r === 'week' ? Date.now() - 7 * DAY : r === 'since' ? (S.lastExport || 0) : 0; }
  function renderReport() {
    $('#main').innerHTML = '<div class="col"><button class="back" id="rp-b">‹ 记录</button><h1 class="pg-h">导出学习记录</h1><p class="pg-sub">填好姓名和班级，选择范围，生成 PDF 后用电邮发给老师。姓名只写在这份 PDF 上，不会上传到任何地方。</p>' +
      '<form id="rp"><div class="form-row"><label for="rp-n">姓名</label><input id="rp-n" autocomplete="name" value="' + esc(S.profile.name) + '"><label for="rp-c">班级</label><input id="rp-c" value="' + esc(S.profile.cls) + '"></div>' +
      '<fieldset><legend>范围</legend><label class="radio"><input type="radio" name="r" value="all" checked>全部记录</label><label class="radio"><input type="radio" name="r" value="week">最近 7 天</label><label class="radio"><input type="radio" name="r" value="since"' + (S.lastExport ? '' : ' disabled') + '>上次导出以后' + (S.lastExport ? '（' + fmtDT(S.lastExport) + '）' : '') + '</label></fieldset>' +
      '<p id="rp-cnt" class="fine"></p><div class="actions"><button class="btn primary" id="rp-go" type="submit">生成 PDF</button></div></form><div id="rp-out" aria-live="polite"></div></div>';
    $('#rp-b').onclick = () => go('records');
    const rng = () => ($('input[name="r"]:checked') || {}).value || 'all';
    const upd = () => { const E = S.log.filter(l => l.t >= rangeFrom(rng())); $('#rp-cnt').textContent = E.length ? '包含 ' + E.length + ' 次练习，共 ' + E.reduce((s, l) => s + l.items.length, 0) + ' 题。' : '这个范围内还没有练习记录。'; $('#rp-go').disabled = !E.length; };
    $$('input[name="r"]').forEach(r => r.onchange = upd); upd();
    $('#rp').onsubmit = async e => {
      e.preventDefault();
      S.profile.name = $('#rp-n').value.trim(); S.profile.cls = $('#rp-c').value.trim(); save();
      if (!S.profile.name) { $('#rp-out').innerHTML = '<p class="msg err">请先填写姓名，老师才知道是谁的记录。</p>'; $('#rp-n').focus(); return; }
      const btn = $('#rp-go'); btn.disabled = true; btn.textContent = '正在生成…';
      $('#rp-out').innerHTML = '<p class="msg">正在生成 PDF，记录多的话要十几秒。</p>';
      try {
        const blob = await buildPDF(rangeFrom(rng()));
        const fname = '文言字词记录_' + (S.profile.cls ? S.profile.cls + '_' : '') + S.profile.name + '_' + today().replace(/-/g, '') + '.pdf';
        const url = URL.createObjectURL(blob);
        const file = typeof File === 'function' ? new File([blob], fname, { type: 'application/pdf' }) : null;
        const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
        S.lastExport = Date.now(); save();
        $('#rp-out').innerHTML = '<div class="msg"><p><b>PDF 已生成</b>（' + Math.max(1, Math.round(blob.size / 1024)) + ' KB）：' + esc(fname) + '</p><div class="actions">' + (canShare ? '<button class="btn primary" id="rp-sh">发送给老师</button>' : '') + '<a class="btn' + (canShare ? '' : ' primary') + '" href="' + url + '" download="' + esc(fname) + '">下载 PDF</a></div><p class="fine">下载后，用电邮把 PDF 发给老师。</p></div>';
        const sh = $('#rp-sh'); if (sh) sh.onclick = () => navigator.share({ files: [file], title: '文言字词学习记录', text: S.profile.name + ' 的文言字词学习记录' }).catch(() => {});
      } catch (err) { console.error(err); $('#rp-out').innerHTML = '<p class="msg err">生成失败。请刷新页面后再试一次；如果仍然失败，换用电脑上的 Chrome 或 Safari。</p>'; }
      btn.disabled = false; btn.textContent = '生成 PDF';
    };
  }
  function reportBlocks(from) {
    const E = S.log.filter(l => l.t >= from);
    const rng = from ? fmtDT(from) + ' 至 ' + fmtDT(Date.now()) : '全部记录（至 ' + fmtDT(Date.now()) + '）';
    const B = [];
    const rec = E.filter(l => l.kind !== 'mcq'), mc = E.filter(l => l.kind === 'mcq');
    const ri = rec.flatMap(l => l.items), selfN = ri.filter(x => x.how === 'self').length;
    const rsc = ri.reduce((s, x) => s + x.mark, 0), rmax = ri.length * 2;
    const mok = mc.reduce((s, l) => s + l.score, 0), mmax = mc.reduce((s, l) => s + l.max, 0);
    const mocks = E.filter(l => l.kind === 'mock');
    B.push('<h1>字斟句酌 · 文言字词学习记录</h1><div class="meta"><span>姓名：<b>' + esc(S.profile.name) + '</b></span><span>班级：<b>' + esc(S.profile.cls || '—') + '</b></span><span>范围：' + rng + '</span><span>等级：' + RANKS[rankOf(S.xp)][0] + ' · ' + S.xp + ' XP · 连续 ' + streak() + ' 天</span></div>');
    const wrong = {}; ri.forEach(x => { if (x.mark < 1.5) { const k = x.tid + ':' + x.w; wrong[k] = (wrong[k] || 0) + 1; } });
    const weak = Object.entries(wrong).sort((a, b) => b[1] - a[1]).slice(0, 12);
    B.push('<div class="sec">老师速览</div><div class="glance"><p><b>测验（默写释义）：</b>' + ri.length + ' 题，得分 ' + markStr(rsc) + ' / ' + rmax + (rmax ? '（' + Math.round(rsc / rmax * 100) + '%）' : '') + '；其中自评 <span class="self">' + selfN + '</span> 题（下表以「自评」标出，请复核）。</p>' +
      '<p><b>1(a) 模拟：</b>' + (mocks.length ? mocks.length + ' 次，得分 ' + mocks.map(l => markStr(l.score)).join('、') + '（满分 4）' : '无') + '</p><p><b>测一测（选择题）：</b>' + mmax + ' 题，答对 ' + mok + (mmax ? '（' + Math.round(mok / mmax * 100) + '%）' : '') + '</p>' +
      '<p><b>最常失分的字词：</b>' + (weak.length ? weak.map(([k, n]) => { const [tid, w] = k.split(':'); return '《' + (TX[tid] ? TX[tid].short : tid) + '》' + w + ' ×' + n; }).join('　') : '无') + '</p></div>');
    B.push('<div class="sec">各篇考点掌握情况（截至导出时）</div><table><thead><tr><th>课文</th><th>考点</th><th>已掌握</th><th>练习中</th><th>读过</th><th>未学</th><th>掌握度</th></tr></thead><tbody>' + ORDER.map(tid => { const ks = TX[tid].keys.map(w => level(tid + ':' + w)); const c = l => ks.filter(x => x === l).length; return '<tr><td class="wen">《' + esc(TX[tid].T.title) + '》</td><td>' + ks.length + '</td><td>' + c(3) + '</td><td>' + c(2) + '</td><td>' + c(1) + '</td><td>' + c(0) + '</td><td>' + Math.round(textMastery(tid) * 100) + '%</td></tr>'; }).join('') + '</tbody></table>');
    if (rec.length) {
      B.push('<div class="sec">测验作答明细</div>');
      rec.forEach(l => {
        B.push('<p style="margin:4px 0"><b>' + KIND[l.kind] + '</b> · ' + fmtDT(l.t) + ' · 得分 ' + markStr(l.score) + ' / ' + l.max + '</p><table><thead><tr><th style="width:40%">句子（加点字以红线标出）</th><th>出处／考点课文</th><th>学生答案</th><th>得分</th><th>参考答案</th></tr></thead><tbody>' +
          l.items.map(x => '<tr><td class="wen">' + markedU(x.s) + '</td><td>' + esc(x.src) + (x.kind === 'out' ? '<br><small>考点：《' + esc(TX[x.tid] ? TX[x.tid].T.title : '') + '》</small>' : '') + '</td><td class="wen">' + esc(x.ans || '（未作答）') + '</td><td class="' + (x.mark >= 2 ? 'ok' : 'bad') + '">' + markStr(x.mark) + (x.how === 'self' ? ' <span class="self">自评</span>' : '') + '</td><td class="wen">' + esc(x.model) + '</td></tr>').join('') + '</tbody></table>');
      });
    }
    const selfs = ri.filter(x => x.how === 'self' && x.ans);
    if (selfs.length) {
      B.push('<div class="sec">答案库候选（学生自评、系统未收录的答案）</div><table><thead><tr><th>课文</th><th>字词</th><th>学生答案</th><th>自评</th><th>参考答案</th></tr></thead><tbody>' +
        selfs.map(x => '<tr><td class="wen">《' + esc(TX[x.tid] ? TX[x.tid].short : x.tid) + '》</td><td class="wen">' + esc(x.w) + '</td><td class="wen">' + esc(x.ans) + '</td><td class="self">' + markStr(x.mark) + '</td><td class="wen">' + esc(x.model) + '</td></tr>').join('') + '</tbody></table>');
    }
    if (mc.length) {
      B.push('<div class="sec">测一测（选择题）</div><table><thead><tr><th>时间</th><th>课文</th><th>得分</th><th>答错的题</th></tr></thead><tbody>' + mc.map(l => '<tr><td>' + fmtDT(l.t) + '</td><td class="wen">《' + esc(TX[l.tid] ? TX[l.tid].T.title : l.tid) + '》</td><td>' + l.score + ' / ' + l.max + '</td><td class="wen">' + (l.items.filter(x => !x.ok).map(x => markedU(x.s) + '<br><small>正确：' + markedU(x.ans) + '；选了：' + markedU(x.pick) + '</small>').join('<br>') || '—') + '</td></tr>').join('') + '</tbody></table>');
    }
    return B;
  }
  async function buildPDF(from) {
    for (const src of LIBS) await loadScript(src);
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* ignore */ } }
    const stage = $('#stage');
    // big tables are split so each block fits a page
    const blocks = [];
    reportBlocks(from).forEach(b => {
      const m = b.match(/^([\s\S]*?<tbody>)([\s\S]*)(<\/tbody><\/table>)$/);
      if (m) { const rows = m[2].match(/<tr>[\s\S]*?<\/tr>/g) || []; for (let i = 0; i < rows.length; i += 8) blocks.push(m[1] + rows.slice(i, i + 8).join('') + m[3]); }
      else blocks.push(b);
    });
    stage.innerHTML = blocks.map(b => '<div class="rb">' + b + '</div>').join('');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const W = 595.28, H = 841.89, M = 36, CW = W - 2 * M, BOT = H - M - 12;
    let y = M;
    for (const el of stage.children) {
      const cv = await window.html2canvas(el, { scale: 1.6, backgroundColor: '#ffffff', logging: false });
      const h = cv.height * CW / cv.width;
      if (y + h > BOT && y > M) { doc.addPage(); y = M; }
      doc.addImage(cv.toDataURL('image/jpeg', 0.85), 'JPEG', M, y, CW, Math.min(h, BOT - M));
      y += h + 6;
    }
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(130); doc.text('Zizhen classical Chinese log  |  ' + (S.profile.cls ? S.profile.cls + '  |  ' : '') + today() + '  |  ' + i + ' / ' + pages, W / 2, H - 20, { align: 'center' }); }
    stage.innerHTML = '';
    return doc.output('blob');
  }

  /* ================= cloud: 报错, answer candidates, live fixes (only when data/config.js has an api url) ================= */
  function openReport(o) {
    const ov = $('#ov');
    ov.innerHTML = '<div class="ov-card" role="dialog" aria-modal="true" aria-labelledby="rp-t"><h2 id="rp-t">报错</h2>' +
      '<p class="ov-ctx"><span class="wen">' + esc(o.s) + '</span><br><span class="fine">《' + esc(TX[o.tid] ? TX[o.tid].T.title : o.tid) + '》 · ' + esc(o.where) + (o.w ? ' · ' + esc(o.w) : '') + '</span><br>现在的内容：' + esc(o.cur) + (o.ans ? '<br>你的答案：' + esc(o.ans) : '') + '</p>' +
      '<form id="rp-f"><fieldset><legend>哪里有问题？</legend>' + o.cats.map((c, i) => '<label class="radio"><input type="radio" name="cat" value="' + esc(c) + '"' + (i ? '' : ' checked') + '>' + esc(c) + '</label>').join('') + '</fieldset>' +
      '<label class="ov-l" for="rp-m">说明（可不填）</label><textarea id="rp-m" rows="3" maxlength="300" placeholder="例如：应该是“沿着”，不是“边缘”"></textarea>' +
      '<p class="fine">匿名发送，不会附上你的姓名和班级。老师核实后会修改。</p><div class="actions"><button type="button" class="btn ghost" id="rp-x">取消</button><button type="submit" class="btn primary">发送</button></div></form></div>';
    ov.hidden = false;
    const close = () => { ov.hidden = true; ov.innerHTML = ''; };
    $('#rp-x').onclick = close; ov.onclick = e => { if (e.target === ov) close(); };
    setTimeout(() => { const f = $('input[name="cat"]', ov); if (f) f.focus(); }, 30);
    $('#rp-f').onsubmit = e => {
      e.preventDefault();
      const cat = ($('input[name="cat"]:checked', ov) || {}).value || '', msg = $('#rp-m').value.trim();
      if (cat === '其他' && !msg) { $('#rp-m').focus(); $('#rp-m').placeholder = '选了“其他”，请写一句说明'; return; }
      outbox({ kind: 'report', where: o.where, tid: o.tid, w: o.w, s: o.s, cur: o.cur, ans: o.ans || '', cat, msg, ref: o.ref, v: APP_V });
      close(); toast('已匿名发送给老师，谢谢！');
    };
  }
  function readBox() { try { return JSON.parse(localStorage.getItem(OBX) || '[]'); } catch (e) { return []; } }
  function writeBox(q) { try { localStorage.setItem(OBX, JSON.stringify(q.slice(-60))); } catch (e) { /* full */ } }
  function outbox(p) { if (!API) return; const q = readBox(); q.push(p); writeBox(q); flushSoon(0); }
  function queueCand(c) { if (!API) return; const q = readBox(); const last = q[q.length - 1]; if (last && last.kind === 'cand' && last.items.length < 30) last.items.push(c); else q.push({ kind: 'cand', items: [c] }); writeBox(q); flushSoon(4000); }
  let flushT = 0, flushing = false;
  function flushSoon(ms) { clearTimeout(flushT); flushT = setTimeout(flush, ms); }
  async function flush() {
    if (!API || flushing || !navigator.onLine) return;
    flushing = true;
    try {
      let q = readBox();
      while (q.length) {
        const p = q[0];
        let ok = false;
        try { const r = await fetch(API, { method: 'POST', body: JSON.stringify(p) }); const j = await r.json(); ok = !!(j && (j.ok || /bad|unknown|no items/.test(j.error || ''))); } catch (e) { ok = false; }
        if (!ok) break;
        q = readBox(); q.shift(); writeBox(q);
      }
    } finally { flushing = false; }
  }
  window.addEventListener('online', () => flushSoon(1000));
  async function loadFixes() {
    let cached = null; try { cached = JSON.parse(localStorage.getItem(FIXK) || 'null'); } catch (e) { /* none */ }
    if (!API) return [];
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 1800);
      const r = await fetch(API + (API.indexOf('?') < 0 ? '?' : '&') + 'a=fixes', { signal: ctl.signal }); clearTimeout(tm);
      const j = await r.json();
      if (j && j.ok && Array.isArray(j.fixes)) { try { localStorage.setItem(FIXK, JSON.stringify({ t: Date.now(), fixes: j.fixes })); } catch (e) { /* full */ } return j.fixes; }
    } catch (e) { /* offline or slow: use the last copy */ }
    return cached && Array.isArray(cached.fixes) ? cached.fixes : [];
  }
  function applyFixes(list) {
    const MCQ = {}; ORDER.forEach(tid => (TX[tid].T.mcq || []).forEach(q => { MCQ[q.id] = q; }));
    let n = 0;
    (list || []).forEach(f => {
      const d = f.data || {};
      try {
        if (f.type === 'gloss') {
          const [tid, sid, ti] = String(f.target).split(':'); const X = TX[tid]; const t = X && X.sents[+sid] && X.sents[+sid].toks[+ti];
          if (!t || t.w !== d.w) return;
          if (d.g) t.g = String(d.g); if (d.n != null) t.f.n = String(d.n); n++;
        } else if (f.type === 'off') {
          if (ITEM[f.target]) { ITEM[f.target].off = true; const i = ITEMS.indexOf(ITEM[f.target]); if (i >= 0) ITEMS.splice(i, 1); n++; }
          else if (MCQ[f.target]) { MCQ[f.target].off = true; n++; }
        } else {
          const it = ITEM[f.target]; if (!it) return;
          if (f.type === 'ans') {
            (d.remove || []).forEach(a => ['2', '1.5', '1'].forEach(k => { it.ans[k] = (it.ans[k] || []).filter(x => nrm(x) !== nrm(a)); }));
            const k = ['2', '1.5', '1'].indexOf(String(d.tier)) >= 0 ? String(d.tier) : '2';
            (d.add || []).forEach(a => { if (!a) return; ['2', '1.5', '1'].forEach(t2 => { it.ans[t2] = (it.ans[t2] || []).filter(x => nrm(x) !== nrm(a)); }); it.ans[k] = (it.ans[k] || []).concat([String(a)]); });
          } else if (f.type === 'model') { if (d.model) it.model = String(d.model); }
          else if (f.type === 'note') { it.note = String(d.note || ''); }
          n++;
        }
      } catch (e) { /* skip a malformed fix */ }
    });
    return n;
  }

  /* ================= boot ================= */
  (async () => {
    const fx = await loadFixes();
    applyFixes(fx);
    paintHead();
    route();
    flushSoon(2500);
  })();
  window.ZZapp = { autoMark, splitAns, state: () => S, applyFixes };
})();
