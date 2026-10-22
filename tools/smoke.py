"""Smoke test: python3 tools/smoke.py <base_url> <out_dir>  — screenshots every view (phone + desktop), drives MCQ / quiz / PDF."""
import sys, os, json
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
errs = []

def shot(page, name):
    page.wait_for_timeout(250)
    page.screenshot(path=f"{out}/{name}.png", full_page=False)

with sync_playwright() as p:
    b = p.chromium.launch()
    for label, vp in [('phone', {'width': 390, 'height': 844}), ('desk', {'width': 1366, 'height': 860})]:
        ctx = b.new_context(viewport=vp, device_scale_factor=1, accept_downloads=True)
        page = ctx.new_page()
        page.on('console', lambda m: errs.append(f'[{label}] console.{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errs.append(f'[{label}] pageerror: {e}'))
        page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        page.goto(base + '/index.html#home'); page.wait_for_timeout(500)
        shot(page, f'{label}-01-home')
        page.goto(base + '/index.html#read'); shot(page, f'{label}-02-shelf')
        tid = page.eval_on_selector('.shelf a', 'a => a.getAttribute("href").split("/")[1]')
        page.goto(base + f'/index.html#read/{tid}'); page.wait_for_timeout(300)
        page.click('.text .w.k >> nth=0'); shot(page, f'{label}-03-reader-note')
        page.click('.seg button[data-mode="dz"]'); shot(page, f'{label}-04-reader-dz')
        page.goto(base + f'/index.html#mcq/{tid}'); page.wait_for_timeout(200)
        n = 0
        while page.locator('.opt').count() and n < 30:
            page.click('.opt >> nth=0');
            if n == 0: shot(page, f'{label}-05-mcq-fb')
            page.click('#mq-next'); n += 1
            if page.locator('.result').count(): break
        shot(page, f'{label}-06-mcq-result')
        page.goto(base + '/index.html#quiz'); shot(page, f'{label}-07-quiz-setup')
        page.click('#go-mock'); page.wait_for_timeout(300); shot(page, f'{label}-08-mock')
        page.fill('#a0', '喂'); page.fill('#a1', '随便写写')
        page.click('#qz-sub'); page.wait_for_timeout(200); shot(page, f'{label}-09-mock-marked')
        while page.locator('[data-self]').count():
            page.click('[data-self] >> nth=0'); page.wait_for_timeout(100)
        shot(page, f'{label}-10-mock-done')
        page.goto(base + '/index.html#quiz')
        page.click('#qf button[type=submit]'); page.wait_for_timeout(200)
        k = 0
        while k < 25 and page.locator('#qz-sub').count():
            page.fill('.ansrow input', ['却', '喂', '不知道'][k % 3]); page.click('#qz-sub'); page.wait_for_timeout(80)
            if k == 0: shot(page, f'{label}-11-free-fb')
            if page.locator('[data-self]').count(): page.click('[data-self] >> nth=1')
            page.click('#qz-next'); k += 1
        shot(page, f'{label}-12-free-result')
        page.goto(base + '/index.html#home'); shot(page, f'{label}-13-home-after')
        page.goto(base + '/index.html#records'); shot(page, f'{label}-14-records')
        page.screenshot(path=f"{out}/{label}-14b-records-full.png", full_page=True)
        if label == 'desk':
            page.goto(base + '/index.html#records/pdf'); page.fill('#rp-n', '测试学生'); page.fill('#rp-c', '25J01')
            page.click('#rp-go')
            try:
                page.wait_for_selector('#rp-out a[download]', timeout=40000)
                with page.expect_download() as dl:
                    page.click('#rp-out a[download]')
                dl.value.save_as(f'{out}/report.pdf'); print('PDF saved')
            except Exception as e:
                errs.append('PDF: ' + str(e)); print(page.inner_text('#rp-out'))
            shot(page, 'desk-15-pdf')
        st = page.evaluate('JSON.stringify(ZZapp.state())')
        print(label, 'xp', json.loads(st)['xp'], 'log', len(json.loads(st)['log']))
        ctx.close()
    b.close()
print('\n'.join(errs) if errs else 'no console errors')
