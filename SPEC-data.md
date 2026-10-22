# 字斟句酌 · 数据格式说明 (data spec)

Each prescribed text lives in ONE file: `data/texts/<id>.js`. IDs:
`taohua` 《桃花源记》 · `zouji` 《邹忌讽齐王纳谏》 · `mashuo` 《马说》 · `zongqiu` 《纵囚论》 · `liujingting` 《柳敬亭说书》

The file is plain JavaScript (UTF-8) and makes ONE call:

```js
ZZ.addText({
  id: 'taohua',
  title: '桃花源记',
  author: '陶渊明',
  era: '东晋',
  source: '《陶渊明集》',                  // 出处, short
  intro: '两三句：作者、写作背景、主旨。',   // shown above the text; Chinese
  paras: [                                  // paragraphs, as in the department 学习单
    [                                       // sentences of paragraph 1
      { zh: '[晋|晋朝][太元|东晋孝武帝的年号（376—396）][中|期间]，[武陵|郡名，在今湖南常德一带][人|人][捕鱼|捕鱼][*为|作为；当作|k=1][业|职业]。',
        bh: '东晋太元年间，武陵郡有个人以捕鱼为职业。',
        note: '' },                         // optional sentence-level note (特殊句式 etc.)
    ],
  ],
  lex: { ... },     // 考点 lexicon, see §2
  mcq: [ ... ],     // see §3
  recall: [ ... ],  // see §4
});
```

## 1. Token notation inside `zh`

- Every word is a bracket token `[word|gloss]` followed by optional `|key=value` fields.
- Punctuation stays OUTSIDE brackets, exactly as in the original text.
- Concatenating all words + punctuation must reproduce the original text exactly (the validator checks this against `ORIGINAL` — see §6).
- Segment by WORD as a 文言 teacher would: mostly single characters; keep 复音词/专名 together (阡陌, 俨然, 黄发垂髫, 太元, 武陵, 伯乐, 千里马, 唐太宗). Do not lump whole phrases.
- `gloss` = the meaning IN THIS CONTEXT in 白话, concise (e.g. `沿着；顺着`). Use the department's wording where the department gives one. For function words, give function + meaning (e.g. `之|助词，的` / `而|连词，表转折，却`). For proper nouns give a short identification.
- `*` before the word marks a 考点 (exam-worthy 实词/虚词, 通假字, 古今异义, 词类活用, 一词多义). Every `*` word needs an entry in `lex` with the same key, and `k=N` saying which sense (1-based) of that entry is used here.
- Optional fields:
  - `k=2` sense number in lex (required for `*` words)
  - `py=xiàn` pinyin, ONLY when the reading is special/uncommon in context (见→xiàn, 要→yāo, 食→sì, 邪→yé, 少→shǎo …) or for rare characters
  - `n=通假字：“见”同“现”，出现` a short note. Start with a label when one applies: 通假字 / 古今异义 / 词类活用 / 一词多义 / 偏义复词 / 特殊用法. Example: `n=古今异义：古义“交错相通”，今义“交通运输”`
- No `[`, `]`, `|` characters inside glosses or notes. Use full-width （）“”；，：in Chinese text.

## 2. `lex` — 考点 lexicon (one entry per `*` word)

```js
lex: {
  '缘': {
    py: 'yuán',
    senses: [
      { m: '沿着；顺着', pos: '介词', ex: [ { s: '⟨缘⟩溪行，忘路之远近。', src: '陶渊明《桃花源记》', here: true } ] },
      { m: '因为；由于', pos: '介词', ex: [ { s: '不识庐山真面目，只⟨缘⟩身在此山中。', src: '苏轼《题西林壁》' } ] },
      { m: '边缘', pos: '名词', ex: [] },
    ],
    tip: '一句话备考提示，例如：考试中“缘＋地点”多解作“沿着”。',
  },
}
```
- `senses`: list the sense(s) used in THIS text first (mark their example `here: true`), then 2–4 other common senses (一词多义) a JC student should be able to tell apart. Wording in 《古汉语常用字字典》 style.
- `ex.s`: the target word wrapped in ⟨ ⟩ (U+27E8 / U+27E9). Examples from other texts MUST be real, accurately quoted sentences from well-known 文言 texts (see §5 on verification). An empty `ex` is fine for a sense when you have no reliable example.
- Multi-character 考点 (阡陌, 俨然, 妻子, 无论) use the whole word as key.

## 3. `mcq` — 测一测 (Section A-style MCQ, auto-marked)

Three types; aim for the counts in the brief.

```js
// 释义: one sentence, choose the meaning of the target
{ type: '释义', s: '⟨缘⟩溪行，忘路之远近。', src: '桃花源记',
  o: ['沿着；顺着', '因为；由于', '边缘', '缘分'], a: 0,
  why: '“缘”在此作介词，“缘溪行”即沿着溪水走。B 为“只缘身在此山中”的用法。' }

// 辨析: which pair uses the target word in the SAME sense (or: different sense — say so in q)
{ type: '辨析', q: '下列各组句子中，加点字意思相同的一组是',
  o: [ [ { s: '⟨复⟩前行', src: '桃花源记' }, { s: '非⟨复⟩吴下阿蒙', src: '孙权劝学' } ],
       [ { s: '…', src: '…' }, { s: '…', src: '…' } ], … 4 options ],
  a: 0, why: '…' }

// 判断: which explanation is WRONG (or RIGHT — say so in q)
{ type: '判断', q: '下列对句中加点字的解释，不正确的一项是',
  o: [ { s: '⟨缘⟩溪行', g: '沿着' }, { s: '屋舍⟨俨然⟩', g: '整齐的样子' }, … 4 options ],
  a: 2, why: '…' }
```
- Distractors must be plausible: other senses of the same word, modern-meaning traps (古今异义), or near-miss meanings. Never silly options.
- `why` explains the answer AND why the most tempting distractor is wrong. Chinese.
- For 辨析/判断 the in-syllabus sentence should come from THIS text; partner sentences may come from the other four prescribed texts or from well-known 文言 texts (verified).

## 4. `recall` — free-recall quiz items (测验 tab)

```js
{ id: 'th-01',
  kind: 'in',                         // 'in' = sentence from this prescribed text; 'out' = sentence from an out-of-syllabus text
  s: '南阳刘子骥，高尚士也，闻之，欣然⟨规⟩往。',
  src: '陶渊明《桃花源记》',          // author《title》of the sentence shown
  w: '规',                            // tested word (must also appear as a word in THIS prescribed text)
  link: '欣然⟨规⟩往',                 // the phrase in THIS prescribed text that shows the SAME sense (for 'in' items: same as the tested phrase)
  ans: { '2': ['计划', '打算', '规划'], '1.5': [], '1': [] },   // accepted answers by mark tier
  model: '计划；打算',                // model answer shown after answering
  note: '一句话：此义与常见的“规劝”“规矩”区别何在。',
  dept: true,                         // true if taken from a department worksheet / past paper; omit otherwise
  ref: 'A组：《桃花源记》堂测_With Ans',  // where a dept item came from; for 'out' items a verification URL or book reference
}
```
- Marking follows SEAB 1(a): 2 marks per item; the marking guides accept several synonyms for full marks and give 1.5 / 1 for vaguer answers (e.g. 掉舌：动舌/说书 2；大声说话 1.5；开口 1). Put the full-mark synonyms in `'2'` (short, bare words a student would actually write: 计划 / 打算, NOT long sentences), partial-credit answers in `'1.5'`/`'1'` when they make sense. The app strips punctuation and matches answers; students self-check anything unmatched.
- **THE KEY RULE for `kind: 'out'`**: the tested word must appear in THIS prescribed text, and its meaning in the out-of-syllabus sentence must be THE SAME sense as in the prescribed text (`link`). 一词多义 traps go in the MCQs, not here. Example from GCE A 2022: 韩愈《祭十二郎文》“如此孩提者又可⟨冀⟩其成立邪？” — 冀：希望 — tests the same 冀 as 《纵囚论》“意其必来以⟨冀⟩免”. GCE A 2023: 欧阳修《醉翁亭记》“饮少⟨辄⟩醉” — 辄：就 — same as 《柳敬亭说书》“⟨辄⟩不言”.
- Every `kind: 'in'` 考点 in lex should normally get one `recall` item.

## 5. Accuracy and verification (non-negotiable)

- The department's materials (学习单 教师版 / 白话注释 / With Ans worksheets) are the authority for the text version, paragraphing, and glosses. Online/standard references (《古汉语常用字字典》, 人教版/部编版 textbook notes, 汉典 zdic.net, 古诗文网 gushiwen.cn) fill gaps and supply extra acceptable answers.
- Every out-of-syllabus sentence (in `recall` with kind 'out', in `lex` examples, in MCQ partners) must be a REAL sentence, quoted accurately, with the correct author and title. Prefer well-known texts (初中/高中 语文 文言篇目, 《论语》《孟子》《史记》《世说新语》, 唐宋八大家). Check every one with WebSearch/WebFetch (gushiwen.cn, zdic, baike, ctext.org) and put a URL in `ref` for recall items. If you cannot verify a sentence, leave it out.
- If the department text differs from the standard published version, follow the department and mention the difference in `note` of that sentence.

## 6. Validation

Run `node tools/validate.js data/texts/<id>.js` from the repository root. It checks: JS parses; bracket syntax; every `*` word has lex + valid `k`; ⟨⟩ markers present; MCQ answer indices; recall fields; and that the text reconstructs to the ORIGINAL string, which you put at the top of the file:

```js
/* ORIGINAL (department version — reproduced exactly, paragraphs separated by \n)
晋太元中，武陵人捕鱼为业。缘溪行，忘路之远近。……
……
ORIGINAL */
```
Fix every error before finishing. Warnings should be reviewed.
