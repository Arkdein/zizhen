// node tools/build_dash_index.js > out.json — compact content index for the teacher dashboard artifact
const fs = require('fs'), vm = require('vm');
const { parseZh } = require('../js/parse.js');
const T = {}; const ctx = { ZZ: { addText: t => { T[t.id] = t; } } };
const ORDER = ['taohua', 'zouji', 'mashuo', 'zongqiu', 'liujingting'];
ORDER.forEach(id => vm.runInNewContext(fs.readFileSync('data/texts/' + id + '.js', 'utf8'), ctx));
const plain = s => String(s || '').replace(/[⟨⟩]/g, '');
const out = { v: new Date().toISOString().slice(0, 10), texts: {}, items: {}, mcq: {}, toks: {}, sents: {} };
ORDER.forEach(tid => {
  const t = T[tid]; out.texts[tid] = t.title;
  let sid = 0;
  t.paras.forEach(p => p.forEach(s => {
    const toks = parseZh(s.zh);
    out.sents[tid + ':' + sid] = toks.map(x => x.w).join('');
    toks.forEach((x, ti) => { if (!x.punct && x.g) out.toks[tid + ':' + sid + ':' + ti] = [x.w, x.g, x.f.n || ''].filter((v, i) => i < 2 || v); });
    sid++;
  }));
  t.recall.forEach(r => { out.items[r.id] = { tid, w: r.w, s: r.s, src: r.src, k: r.kind, m: r.model, a: r.ans, l: r.link, off: r.off ? 1 : undefined }; });
  t.mcq.forEach((q, i) => {
    const ans = q.type === '释义' ? q.o[q.a] : q.type === '辨析' ? q.o[q.a].map(x => plain(x.s)).join(' ／ ') : plain(q.o[q.a].s) + '：' + q.o[q.a].g;
    out.mcq[tid + '-mcq-' + (i + 1)] = { tid, t: q.type, s: plain(q.s || q.q), a: ans };
  });
});
process.stdout.write(JSON.stringify(out));
