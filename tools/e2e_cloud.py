"""End-to-end test of 报错 / 答案候选 / live fixes against tools/mock_api.py (its admin route stands in for the Claude dashboard).
python3 tools/e2e_cloud.py http://localhost:8766 http://localhost:8767 test123 <shots_dir>"""
import sys, json, os, urllib.request
from playwright.sync_api import sync_playwright

base, api, pw, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
os.makedirs(out, exist_ok=True)
dump = lambda: json.load(urllib.request.urlopen(api + '/exec?a=dump'))
errs = []
ok = lambda cond, msg: print(('PASS ' if cond else 'FAIL ') + msg) or (None if cond else errs.append(msg))

with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------- student: gloss report (phone) ----------
    st = b.new_context(viewport={'width': 390, 'height': 844})
    pg = st.new_page(); pg.on('pageerror', lambda e: errs.append('student pageerror ' + str(e)))
    pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    pg.goto(base + '/index.html#read/mashuo'); pg.wait_for_timeout(600)
    pg.click('.text .w.k >> nth=2'); pg.wait_for_timeout(200)
    word = pg.inner_text('#sheet .note .hw b'); gloss0 = pg.inner_text('#sheet .note .g')
    pg.click('#sheet [data-rep="gloss"]'); pg.wait_for_timeout(200)
    pg.screenshot(path=out + '/s1-report-dialog.png')
    pg.check('input[name="cat"] >> nth=0'); pg.fill('#rp-m', '测试：释义应改')
    pg.click('#rp-f button[type="submit"]'); pg.wait_for_timeout(1200)
    R = dump()['R']; ok(len(R) == 1 and R[0]['ref'].get('type') == 'gloss' and R[0]['w'] == word, f'gloss report reached sheet ({word})')
    ok('name' not in json.dumps(R) and '姓名' not in json.dumps(R), 'report carries no name')
    # ---------- student: self-marked answer → candidate ----------
    pg.goto(base + '/index.html#quiz'); pg.wait_for_timeout(300)
    for t in ['taohua', 'zouji', 'zongqiu', 'liujingting']:
        pg.uncheck(f'input[name="t"][value="{t}"]')
    pg.check('input[name="src"][value="in"]'); pg.check('input[name="n"][value="5"]')
    pg.click('#qf button[type=submit]'); pg.wait_for_timeout(300)
    pg.fill('.ansrow input', '甲乙丙丁'); pg.click('#qz-sub'); pg.wait_for_timeout(200)
    pg.screenshot(path=out + '/s2-selfmark.png')
    item_id = pg.evaluate("(()=>{const s=ZZapp.state();return null})()")
    pg.click('[data-self][data-m="2"]'); pg.wait_for_timeout(200)
    # item id from the quiz state via the report button's context
    pg.click('[data-rep="item"]'); pg.wait_for_timeout(150); pg.click('#rp-x')
    pg.wait_for_timeout(5500)
    C = dump()['C']; ok(len(C) == 1 and C[0]['ans'] == '甲乙丙丁' and C[0]['self'] == 2, 'self-marked answer reached sheet as candidate')
    cand_item = C[0]['id'] if C else ''
    # ---------- teacher side: the Claude dashboard writes fix rows; the mock's admin route stands in for it ----------
    def admin(**kw):
        req = urllib.request.Request(api + '/exec', data=json.dumps(dict(kind='admin', key=pw, **kw)).encode(), method='POST')
        return json.load(urllib.request.urlopen(req))
    at = R[0]['ref']['at'] if R else ''
    ok(admin(op='fix', fix={'type': 'gloss', 'target': at, 'data': {'w': word, 'g': '【已修改的测试释义】', 'n': ''}})['ok'], 'gloss fix stored')
    ok(admin(op='fix', fix={'type': 'ans', 'target': cand_item, 'data': {'tier': '2', 'add': ['甲乙丙丁']}})['ok'], 'candidate accepted as 2-mark answer')
    # ---------- student sees fixes on next open ----------
    pg.goto(base + '/index.html#read/mashuo'); pg.reload(); pg.wait_for_timeout(900)
    pg.click('.text .w.k >> nth=2'); pg.wait_for_timeout(200)
    ok('已修改的测试释义' in pg.inner_text('#sheet .note .g'), 'student app shows the corrected gloss')
    am = pg.evaluate(f"(()=>{{const T=ZZ.texts.mashuo; const it=T.recall.find(r=>r.id==='{cand_item}'); return it? ZZapp.autoMark(it,'甲乙丙丁'):null}})()")
    ok(am and am.get('status') == 'auto' and am.get('mark') == 2, 'accepted answer now auto-marks 2')
    # ---------- undo ----------
    gid = [f for f in dump()['F'] if f['type'] == 'gloss'][0]['id']
    admin(op='undo', id=gid)
    pg.reload(); pg.wait_for_timeout(900); pg.click('.text .w.k >> nth=2'); pg.wait_for_timeout(200)
    ok('已修改的测试释义' not in pg.inner_text('#sheet .note .g'), 'undo restores the original gloss')
    b.close()
print('\n'.join(errs) if errs else 'ALL PASS')
