# 字斟句酌 · 内容复核清单（给老师）

Each text file was built from the department's 学习单 (教师版), 白话注释 and answer keys, then checked by a separate reviewer: every gloss, every MCQ key, and every 课外 sentence (real, correctly quoted, same sense as the prescribed usage). Definite errors were fixed. The points below are judgement calls left for you. Each one names the item `id` or 考点, so you can find it in `data/texts/<id>.js`.

## Department text vs department text (which version is canonical?)

| Text | Point | What the app uses now |
|---|---|---|
| 《柳敬亭说书》 | 2020 学习单: 不怕其齰舌死也. 2024 学习单 and 通行本: 不怕其**不**齰舌死也. | 2020 wording, with 不怕 = 恐怕. The MCQ has been made safe for both readings. If 2024 is canonical, change the sentence and gloss 不怕 as 不愁. |
| 《柳敬亭说书》 | 𠷺夬 (department) / 勃夬 / 㕮夬 | 𠷺夬. A small bundled font makes 𠷺 display on all phones. |
| 《柳敬亭说书》 | 张岱生卒: 2020 has 1597—1679; 2024 has 1597—1689, but also says “约1680年卒”. | 1597—1689. Please confirm. |
| 《邹忌讽齐王纳谏》 | 我孰与徐公美 (原文表) vs 吾孰与 (学习单问答题, 通行本). The reviewer suspects 我 is a copying slip. | 我 |
| 《邹忌讽齐王纳谏》 | 由是观之 vs 由此观之; 谤议 vs 谤讥 (both appear in the department files; HK EDB also has 谤议). | 由是, 谤议 |
| 《马说》 | 只辱于 (department) vs 祗辱于 (部编版); 学习单 ends 第二段 with ！ while 课堂练习 has ？ | Department wording |
| 《纵囚论》 | 学习单 table vs 白话注释: 偶一为之耳/尔, 此岂近于人情(哉), 及期(，)而卒 | 白话注释 |
| 《桃花源记》 | 学习单 marks 为(wéi)具言所闻. Its own translation (告诉了他们) points to wèi. | Glossed as 对；向, with both readings noted |

## Department glosses a reviewer questioned (kept as the department wrote them)

- **受上赏** (zouji): the department says 通“授”，给予. Most editions read it as 得到, as does the 学习单's own translation (可得上等奖赏). The app accepts both for full marks. Please confirm you'd give 得到 full marks.
- **复来** (zongqiu): the department says 归来. The usual reading is 副词“又”. Both get full marks.
- **临之** (zongqiu): the department says 治理. The usual reading is 对待. Both get full marks.
- **致尔** (zongqiu): the department says 尔 = 这样. Many editions read it as 罢了.
- **以必能** (zongqiu): the department says 表转折. It is more often read as 而.
- **就** (zongqiu): the department says 受；被. 被 now gets full marks, following the department.
- **致** (zongqiu): the department says 收到；得到；取得. 收到 now gets full marks.
- **所以求此名也** (zongqiu): the 白话注释 says 表原因; the 学习单 says 表目的. The app follows the 学习单.
- **等** (mashuo): the 学习单 glosses it 等同，一样, but the 课堂练习 answer key gives 相同/一样 no marks. ms-in-26 follows the answer key. ms-out-01 (陈涉世家 等死) accepts 同样/一样.
- **辱 / 尽** (mashuo): the department labels both 形容词用作动词. 辱 reads better as a passive (受屈辱).
- **呫哔** (liujingting): the department says 小声说话. Its 本义 is 诵读.

## Marking tiers worth a second look

- 盖 (zq-in-23, zq-out-08 出师表): 大概是因为 gets 2 and 大概 gets 1.5. The reviewer would lower both, because 盖 here is 承接上文、说明原因.
- 款款 (lj-in-33): 从容地 gets 2. That arguably describes the manner rather than glossing the word, so 1.5 may be fairer.
- 辱 (ms-in-07): 埋没 alone gets 1. The department gloss is 受屈辱，埋没, so 2 is arguable.
- 施德于天下 (zq-in-49): 在 gets 1.5. The department's translation uses 在, so 2 is arguable.
- Bare 同“邀” / 通“俱” (th-in-21, th-in-22, th-out-01, th-out-02, th-out-25) get full marks. Your 堂测 key says the 通假 note is optional, which suggests the meaning (邀请) is what earns the marks.
- 找到 (th-out-21 又得钴鉧潭) gets full marks, which blurs the 发现 / 找到 split that the 学习单's 一词多义 for 得 teaches.
- 苛求 (求), 赏识 (知), 只能 (只) (mashuo) may be lenient full-mark answers.

## Past-paper decisions

- **2024 (ii) 《孙权劝学》“即更刮目相待”**: SEAB's guide marks it 就／便. The only 即 in the five texts is 《桃花源记》's “太守即遣人随其往”, which means 立即, so under the same-sense rule it is **not** a 测验 item. It appears instead as a 测一测 contrast question and in the 即 entry's 一词多义. The item is still in `taohua.js` as `th-out-04` with `off: true`. Delete that flag to switch it on.
- **2025 (ii) 非复吴下阿蒙**: linked to 复 in both 《邹忌》 (而复问其妾) and 《桃花源记》 (复前行). The sense is the same in both.
- **师说 “传道受业”** was removed as a 课外 item for 受上赏, because the senses don't match on either reading.

## Coverage gaps (honest limits)

- Some 考点 have no 课外 item, because no verifiable same-sense sentence was found. Examples: 《马说》 称/骈/外/美/能/辱/槽枥/千里; 《桃花源记》 尽/才/俨然/交通/无论/延/扶/果/规; 《纵囚论》 就/临/致. These are still tested in-text and in the MCQs.
- The other JCs' MYE / Prelim / EOY files contain only 1(b) questions for these texts, so no other-JC 1(a) items were available to harvest.

## How to change things

Edit the relevant `data/texts/<id>.js` on GitHub. Add synonyms to `ans['2']`, or move them between tiers. Then bump `VERSION` in `sw.js`. Run `node tools/validate.js data/texts/<id>.js` locally if you can; the README explains the notation.
