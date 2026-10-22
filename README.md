# 字斟句酌 · 文言字词

A study web app for H2 华文与文学 (9575) students preparing for **Paper 3 · A组 第一部分 Q1(a) 解释带点字（词）的意思**. It covers the five prescribed 古代散文: 《桃花源记》《邹忌讽齐王纳谏》《马说》《纵囚论》《柳敬亭说书》.

> 吟安一个字，捻断数茎须。——卢延让《苦吟》

## What students do

| Tab | What happens |
|---|---|
| **首页** | *今日一字*: a 考点 to recall before revealing it. *下一步* suggests activities based on what is due, the weakest text, unread texts, how long since the last 1(a) mock, and whether a report is overdue. *字阵* shows every 考点 of every text as a tile shaded by mastery (未学 / 读过 / 练习中 / 已掌握), with a red outline when it is due for review. Tap a tile to jump to the word in the text. |
| **读课文** | The department's version of each text. Tap **any** word for its contextual meaning, the 白话 of that sentence, notes (通假字 / 古今异义 / 词类活用 …), and, for 考点, the 一词多义 list with this sentence's sense marked. It also lists every other place the word appears across the five texts. Views: 原文 / 对照 (sentence-by-sentence 白话) / 白话. **测一测** gives Section-A-style MCQs per text (释义, 辨析 同/异, 判断 正误), weighted towards weak and due words. |
| **测验** | Free recall with no options. **1(a) 模拟** sets one in-syllabus and one out-of-syllabus item (2 marks each, 4 in total), laid out like the paper. **自选练习** lets students choose texts, source (课内 / 课外 / mixed) and length. **复习到期** follows a spaced-repetition schedule. Every out-of-syllabus sentence tests a word that appears in a prescribed text **with the same meaning**, and the feedback always shows the prescribed sentence (考点出自《…》：…). |
| **记录** | 科举 rank (童生 → 秀才 → 举人 → 贡士 → 进士 → 探花 → 榜眼 → 状元), XP, streak, 13 badges, history, and **PDF export** for emailing to the teacher. |

### Marking (follows the SEAB 1(a) marking guides)
- Accepted answers are stored in tiers (2 / 1.5 / 1), as in the 2022–2025 guides (e.g. 掉舌：动舌/说书 **2**；大声说话 **1.5**；开口 **1**).
- The app ignores punctuation, labels like 通假字, and "同X". If every part of the answer matches, it is marked automatically.
- If a student writes several answers and only some match, the app explains the rule (写两个或多个答案，其中有错的，只得一半) and asks them to judge the unmatched part.
- If nothing matches (a synonym not on the list, a typo), the student sees the model answer and marks themselves: 2 / 1.5 / 1 / 0. **Self-marked items are flagged 自评 in the PDF** so you can check them.

### The PDF report
Students enter their name and class (used only on the PDF), then choose 全部 / 最近 7 天 / 上次导出以后. The report contains:
- a 老师速览 summary: score, self-marked count, mock results, MCQ accuracy, the most-missed words;
- 考点 mastery per text;
- every free-recall answer with source, mark, 自评 flag and model answer;
- every MCQ session with the wrong items.

On phones it opens the share sheet (Mail, Outlook, Teams…). Otherwise it downloads.

Progress lives only in each student's browser (`localStorage`). There are no logins, no server and no personal data leaves the device. Clearing browser data resets progress, so remind students to export before changing phones.

## Files

```
index.html               app shell
css/app.css              styles (light + dark)
js/app.js                engine: views, marking, mastery, XP/badges, PDF
js/parse.js              token parser for the text notation (shared with tools/validate.js)
js/zz.js                 data registry
js/vendor/               html2canvas + jsPDF (MIT), bundled so the PDF works offline and behind school filters
data/texts/<id>.js       ONE FILE PER TEXT: text, glosses, 白话, 考点 lexicon, MCQs, free-recall items  ← edit these
tools/validate.js        checks a data file:  node tools/validate.js data/texts/taohua.js
tools/smoke.py           browser smoke test (Playwright)
SPEC-data.md             full data format
sw.js                    offline cache — bump VERSION after any edit
```

## Editing content

Everything students see comes from the five files in `data/texts/`. No build step: edit on GitHub (pencil icon), commit, and the site updates in about a minute. **Then change `VERSION` at the top of `sw.js`** (e.g. to today's date), so phones that installed the app fetch the new data.

The text uses a bracket notation, one bracket per word:

```
[晋|晋朝][太元|东晋孝武帝的年号][中|期间]，[武陵|郡名]人……[*缘|沿着；顺着|k=1][溪|溪水][行|走]，
```
- `[word|gloss]`: the gloss is the meaning in this sentence.
- `*` marks a 考点, and `k=1` names which sense in that text's `lex` entry this is.
- Optional fields: `py=xiàn` (special reading), `n=通假字：“见”同“现”，出现` (note).

Free-recall items:

```js
{ id: 'lj-out-03', kind: 'out',
  s: '太守与客来饮于此，饮少⟨辄⟩醉，而年又最高，故自号曰醉翁也。',
  src: '欧阳修《醉翁亭记》',            // shown as the citation
  w: '辄', link: '⟨辄⟩不言',            // the prescribed-text usage being tested (same sense)
  ans: { '2': ['就'], '1.5': [], '1': [] },
  model: '就', note: '…', ref: 'GCE A 2023' }
```
`⟨ ⟩` wraps the dotted character. To add synonyms students keep writing, add them to `ans['2']`.

Run the validator after editing (it checks the notation, that the text still reconstructs exactly, answer indices, and that every tested word really occurs in the prescribed text):

```
node tools/validate.js data/texts/zongqiu.js
```

## Content sources
- Text versions, paragraphing and glosses: RVHS department 学习单 (教师版), 白话注释, 逐句分析表 and answer keys. Where these differ from standard editions, the department version is kept and the difference is noted.
- Gaps and extra accepted answers: 《古汉语常用字字典》-style senses, standard textbook notes, 汉典, 古诗文网.
- Past-paper items: GCE A-Level 9575 Paper 3, 2022–2025 (Q1(a)), with tiered answers from the marking guides. Items from department worksheets and other JCs' papers are tagged `dept: true` with their source in `ref`.
- Every out-of-syllabus sentence was checked against an online source, given in `ref`.
