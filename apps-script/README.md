# 报错 · 答案候选 · 老师后台 — setup (about 5 minutes)

This connects the app to a Google Sheet you own. Students' 报错 reports and self-marked answers arrive there anonymously. The teacher dashboard (`teacher.html`) reads them, and the fixes you make go live for every student the next time they open the app.

## 1. Create the Sheet and paste the script
1. Go to **sheets.new** (signed in to the Google account that should own the data) and name the sheet, e.g. `字斟句酌 后台`.
2. **Extensions → Apps Script.** Delete the sample code in `Code.gs`.
3. Open `https://raw.githubusercontent.com/Arkdein/zizhen/main/apps-script/Code.gs`, select all, copy, and paste it into the editor.
4. On the line `const PASSCODE = '';`, type a passcode of at least 6 characters between the quotes. This is the dashboard password, so don't use your Google password.
5. Save (⌘S / Ctrl+S).

## 2. Run setup once
1. In the toolbar's function menu choose **setup**, then click **▶ Run**.
2. Google asks for permission: **Review permissions** → your account → **Advanced** → **Go to … (unsafe)** → **Allow**. (It says "unsafe" because you wrote the script yourself and Google hasn't reviewed it.)
3. Back in the Sheet, three tabs appear: `报错`, `答案候选`, `修改`.

## 3. Deploy as a web app
1. **Deploy → New deployment** → the gear icon → **Web app**.
2. **Execute as: Me**. **Who has access: Anyone**.
   - If the menu only offers "Anyone within *your school*", your school account blocks this. Students' phones aren't signed in, so their reports wouldn't arrive. Use a personal Gmail instead and repeat from step 1.
3. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
4. Paste that URL into `data/config.js` (`api: '…'`), commit, and bump `VERSION` in `sw.js`.

## Updating the script later
Paste the new code, then **Deploy → Manage deployments → ✎ (edit) → Version: New version → Deploy**. The URL stays the same.

## What is stored
- `报错`: where (gloss / MCQ / quiz item), text, word, sentence, the content at the time, the student's answer (quiz items only), category, comment. No name, class or device ID.
- `答案候选`: item id, word, the answer the student wrote, the mark they gave themselves. No name, class or device ID.
- `修改`: your fixes (type, target, content, note, active or undone).

You can sort and filter these tabs in Sheets as usual, but don't rename the tabs or their header row. If you delete a row in `修改`, that fix disappears for students; using 撤销 in the dashboard is safer.
