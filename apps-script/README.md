# 报错 · 答案候选 · live fixes — setup

The Google Sheet **字斟句酌 后台** (owned by the teacher's school account) holds three tabs:
- `报错`: 报错 reports from students: where, word, sentence, the content at the time, the student's answer (quiz items only), category, comment, status. No name, class or device ID.
- `答案候选`: answers students self-marked that the marker didn't recognise: item, word, the answer, their self-mark, status. No name, class or device ID.
- `修改`: the teacher's fixes. Students' apps apply the active ones.

Don't rename the tabs or the header row. To take a fix back, use 撤销 in the dashboard rather than deleting its row.

## Deploying the script (once)
1. Open the Sheet → **Extensions → Apps Script**. Delete the sample code.
2. Copy all of `https://raw.githubusercontent.com/Arkdein/zizhen/main/apps-script/Code.gs` into the editor and save.
3. **Deploy → New deployment** → gear icon → **Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**. Approve the permission prompt: Advanced → Go to … (unsafe) → Allow.
4. Copy the **Web app URL** (ends in `/exec`) into `data/config.js`, commit, and bump `VERSION` in `sw.js`.

## Updating the script later
Paste the new code, then **Deploy → Manage deployments → ✎ → Version: New version → Deploy**. The URL stays the same.
