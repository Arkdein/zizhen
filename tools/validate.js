#!/usr/bin/env node
/* Validates data/texts/<id>.js against SPEC-data.md.  Usage: node tools/validate.js data/texts/taohua.js [--quiet] */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { parseZh } = require('../js/parse.js');

const file = process.argv[2];
const quiet = process.argv.includes('--quiet');
if (!file) { console.error('usage: validate.js <file>'); process.exit(2); }
const src = fs.readFileSync(file, 'utf8');
const errs = [], warns = [];
const E = m => errs.push(m), W = m => warns.push(m);

let T = null;
const ZZ = { addText: t => { if (T) E('addText called twice'); T = t; } };
try { vm.runInNewContext(src, { ZZ }, { filename: file }); }
catch (e) { console.error('JS ERROR: ' + e.message); process.exit(1); }
if (!T) { console.error('addText not called'); process.exit(1); }

const m = src.match(/\/\*\s*ORIGINAL[^\n]*\n([\s\S]*?)\nORIGINAL\s*\*\//);
const ORIG = m ? m[1].trim() : null;
if (!ORIG) W('no ORIGINAL block — cannot check reconstruction');

['id', 'title', 'author', 'era', 'intro', 'paras', 'lex', 'mcq', 'recall'].forEach(k => { if (T[k] == null) E('missing field ' + k); });
const MARK = /⟨([^⟩]+)⟩/;
const PUNCT = /[，。、；：？！“”‘’「」『』（）《》〈〉—…·\s,.;:?!"'()]/;

const allWords = new Map(); // word -> [{gloss, sent}]
const usedKeys = new Set();
let recon = [];
let nTok = 0, nKey = 0, bare = 0;
(T.paras || []).forEach((p, pi) => {
  let ptxt = '';
  if (!Array.isArray(p)) { E(`para ${pi} not array`); return; }
  p.forEach((s, si) => {
    const where = `P${pi + 1}S${si + 1}`;
    if (!s.zh) { E(where + ' no zh'); return; }
    if (!s.bh) E(where + ' no bh (白话)');
    let r;
    try { r = parseZh(s.zh); } catch (e) { E(where + ' parse: ' + e.message); return; }
    r.forEach(t => {
      ptxt += t.w;
      if (t.punct) return;
      if (!t.g) {
        if (t.bare) { bare++; W(`${where} bare text "${t.w}" (no gloss)`); }
        else E(`${where} empty gloss for "${t.w}"`);
        return;
      }
      nTok++;
      if (/[\[\]|]/.test(t.g)) E(`${where} bad chars in gloss "${t.g}"`);
      if (!allWords.has(t.w)) allWords.set(t.w, []);
      allWords.get(t.w).push({ g: t.g, where });
      if (t.key) {
        nKey++;
        const L = T.lex && T.lex[t.w];
        if (!L) E(`${where} *${t.w} has no lex entry`);
        else {
          usedKeys.add(t.w);
          const k = +t.f.k;
          if (!k) E(`${where} *${t.w} missing k=`);
          else if (!L.senses || !L.senses[k - 1]) E(`${where} *${t.w} k=${k} out of range`);
        }
      } else if (t.f.k) W(`${where} k= on non-key word ${t.w}`);
      if (t.w.length > 4 && !/[一-鿿]{2,}/.test(t.w) === false && t.w.length > 6) W(`${where} long token "${t.w}" — segment finer?`);
    });
  });
  recon.push(ptxt);
});
const reconStr = recon.join('\n');
if (ORIG) {
  const norm = x => x.replace(/[\s　]/g, '');
  const a = norm(ORIG), b = norm(reconStr);
  if (a !== b) {
    let i = 0; while (i < a.length && a[i] === b[i]) i++;
    E(`reconstruction differs from ORIGINAL at char ${i}: ORIGINAL «${a.slice(Math.max(0, i - 10), i + 15)}» vs DATA «${b.slice(Math.max(0, i - 10), i + 15)}»`);
  }
  if (ORIG.split('\n').filter(x => x.trim()).length !== (T.paras || []).length) W(`paragraph count: ORIGINAL ${ORIG.split('\n').filter(x => x.trim()).length} vs paras ${(T.paras || []).length}`);
}
const plain = reconStr.replace(/\n/g, '');

// lex
Object.entries(T.lex || {}).forEach(([w, L]) => {
  if (!usedKeys.has(w)) W(`lex "${w}" never marked with * in text`);
  if (!Array.isArray(L.senses) || !L.senses.length) { E(`lex ${w} no senses`); return; }
  let here = 0;
  L.senses.forEach((s, i) => {
    if (!s.m) E(`lex ${w} sense ${i + 1} no m`);
    (s.ex || []).forEach(x => {
      if (!x.s || !MARK.test(x.s)) E(`lex ${w} sense ${i + 1} example missing ⟨⟩: ${x.s}`);
      else if (!x.s.match(MARK)[1].includes(w) && !w.includes(x.s.match(MARK)[1])) W(`lex ${w} example marks "${x.s.match(MARK)[1]}"`);
      if (!x.src) E(`lex ${w} example no src: ${x.s}`);
      if (x.here) here++;
    });
  });
  if (!here) W(`lex ${w}: no example marked here:true`);
});

// mcq
const types = { '释义': 0, '辨析': 0, '判断': 0 };
(T.mcq || []).forEach((q, i) => {
  const w = `mcq#${i + 1}`;
  if (!(q.type in types)) { E(w + ' bad type ' + q.type); return; }
  types[q.type]++;
  if (!Array.isArray(q.o) || q.o.length !== 4) E(w + ' needs 4 options');
  if (!(q.a >= 0 && q.a < (q.o || []).length)) E(w + ' bad answer index');
  if (!q.why) E(w + ' no why');
  if (q.type === '释义') {
    if (!q.s || !MARK.test(q.s)) E(w + ' s missing ⟨⟩');
    (q.o || []).forEach(o => { if (typeof o !== 'string') E(w + ' 释义 options must be strings'); });
    if (new Set(q.o).size !== (q.o || []).length) E(w + ' duplicate options');
  } else if (q.type === '辨析') {
    if (!q.q) E(w + ' no q');
    (q.o || []).forEach((o, j) => {
      if (!Array.isArray(o) || o.length !== 2) { E(`${w} opt ${j + 1} must be a pair`); return; }
      o.forEach(x => { if (!x.s || !MARK.test(x.s) || !x.src) E(`${w} opt ${j + 1} item needs s with ⟨⟩ and src`); });
    });
  } else {
    if (!q.q) E(w + ' no q');
    (q.o || []).forEach((o, j) => { if (!o.s || !MARK.test(o.s) || !o.g) E(`${w} opt ${j + 1} needs s with ⟨⟩ and g`); });
  }
});

// recall
const ids = new Set();
let nIn = 0, nOut = 0;
(T.recall || []).forEach((r, i) => {
  const w = `recall#${i + 1} (${r.id})`;
  if (!r.id) E(w + ' no id'); else if (ids.has(r.id)) E(w + ' duplicate id'); else ids.add(r.id);
  if (r.kind === 'in') nIn++; else if (r.kind === 'out') nOut++; else E(w + ' kind must be in/out');
  if (!r.s || !MARK.test(r.s)) { E(w + ' s missing ⟨⟩'); return; }
  const marked = r.s.match(MARK)[1];
  if (!r.w) E(w + ' no w'); else if (marked !== r.w) W(`${w} ⟨${marked}⟩ ≠ w "${r.w}"`);
  if (!r.src) E(w + ' no src');
  if (!r.link || !MARK.test(r.link)) E(w + ' link missing ⟨⟩');
  else {
    const lk = r.link.replace(/[⟨⟩]/g, '');
    if (!plain.includes(lk)) E(`${w} link "${lk}" not found in prescribed text`);
  }
  if (r.w && !plain.includes(r.w)) E(`${w} tested word "${r.w}" not in prescribed text`);
  if (r.kind === 'in') {
    const ss = r.s.replace(/[⟨⟩]/g, '');
    const core = ss.replace(new RegExp(PUNCT.source, 'g'), '');
    if (!plain.replace(new RegExp(PUNCT.source, 'g'), '').includes(core)) W(`${w} 'in' sentence not found verbatim in text: ${ss}`);
  } else {
    if (!r.ref) E(w + ' out item needs ref (verification URL)');
    if (/桃花源记|邹忌讽齐王纳谏|马说|纵囚论|柳敬亭说书/.test(r.src)) E(w + ' out item src is a prescribed text');
  }
  if (!r.ans || !Array.isArray(r.ans['2']) || !r.ans['2'].length) E(w + ' ans["2"] empty');
  Object.values(r.ans || {}).flat().forEach(a => { if (a.length > 14) W(`${w} long accepted answer "${a}"`); });
  if (!r.model) E(w + ' no model');
});

const out = {
  file: path.basename(file), paragraphs: (T.paras || []).length, sentences: (T.paras || []).reduce((n, p) => n + p.length, 0),
  tokens: nTok, keyTokens: nKey, lex: Object.keys(T.lex || {}).length, mcq: types, recallIn: nIn, recallOut: nOut,
  errors: errs.length, warnings: warns.length,
};
console.log(JSON.stringify(out));
if (errs.length) console.log('ERRORS:\n  ' + errs.join('\n  '));
if (warns.length && !quiet) console.log('WARNINGS:\n  ' + warns.slice(0, 80).join('\n  ') + (warns.length > 80 ? `\n  … +${warns.length - 80}` : ''));
process.exit(errs.length ? 1 : 0);
