"""Local stand-in for apps-script/Code.gs, for testing only.  python3 tools/mock_api.py 8767 PASSCODE
Same request/response shapes as the real script; data lives in memory."""
import json, sys, uuid, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
PASS = sys.argv[2] if len(sys.argv) > 2 else 'test123'
R, C, F = [], [], []
now = lambda: datetime.datetime.utcnow().isoformat() + 'Z'


def admin(d):
    if d.get('key') != PASS:
        return {'ok': False, 'error': 'wrong passcode'}
    op = d.get('op')
    if op == 'read':
        return {'ok': True, 'reports': R, 'cands': [c for c in C if c['status'] == '待处理'], 'fixes': F}
    if op == 'fix':
        f = d.get('fix') or {}
        if f.get('type') not in ('ans', 'model', 'off', 'gloss', 'note') or not f.get('target'):
            return {'ok': False, 'error': 'bad fix'}
        fid = 'f' + uuid.uuid4().hex[:7]
        F.append({'id': fid, 't': now(), 'type': f['type'], 'target': f['target'], 'data': f.get('data') or {}, 'note': f.get('note', ''), 'active': True, 'undone': ''})
        for r in R:
            if r['id'] in (d.get('reports') or []):
                r.update(status='已修改', note=f.get('note', ''), done=now())
        cd = d.get('cand') or {}
        for c in C:
            if c['id'] == cd.get('item') and c['norm'] == cd.get('norm', ''):
                c['status'] = '已采纳'
        return {'ok': True, 'id': fid}
    if op == 'undo':
        for f in F:
            if f['id'] == d.get('id'):
                f['active'] = False; f['undone'] = now(); return {'ok': True}
        return {'ok': False, 'error': 'not found'}
    if op == 'report':
        n = 0
        for r in R:
            if r['id'] in (d.get('ids') or []):
                r.update(status=d.get('status'), note=d.get('note', ''), done=now()); n += 1
        return {'ok': True, 'n': n}
    if op == 'cand':
        n = 0
        for c in C:
            if c['id'] == d.get('item') and c['norm'] == d.get('norm'):
                c['status'] = d.get('status'); n += 1
        return {'ok': True, 'n': n}
    return {'ok': False, 'error': 'unknown op'}


class H(BaseHTTPRequestHandler):
    def _send(self, o):
        b = json.dumps(o, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers(); self.wfile.write(b)

    def log_message(self, *a):
        pass

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        if q.get('a') == ['fixes']:
            return self._send({'ok': True, 'fixes': [{'id': f['id'], 'type': f['type'], 'target': f['target'], 'data': f['data']} for f in F if f['active']]})
        if q.get('a') == ['dump']:
            return self._send({'R': R, 'C': C, 'F': F})
        self._send({'ok': True, 'app': '字斟句酌'})

    def do_POST(self):
        d = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
        k = d.get('kind')
        if k == 'report':
            rid = uuid.uuid4().hex[:8]
            R.append({'t': now(), 'id': rid, 'where': d.get('where'), 'tid': d.get('tid'), 'w': d.get('w'), 's': d.get('s'), 'cur': d.get('cur'), 'ans': d.get('ans'),
                      'cat': d.get('cat'), 'msg': d.get('msg'), 'status': '待处理', 'note': '', 'done': '', 'ref': d.get('ref') or {}, 'v': d.get('v')})
            return self._send({'ok': True, 'id': rid})
        if k == 'cand':
            for x in (d.get('items') or [])[:40]:
                C.append({'t': now(), 'id': x.get('id'), 'tid': x.get('tid'), 'w': x.get('w'), 'ans': x.get('ans'), 'norm': x.get('norm'), 'self': x.get('self'), 'status': '待处理'})
            return self._send({'ok': True})
        if k == 'admin':
            return self._send(admin(d))
        self._send({'ok': False, 'error': 'unknown kind'})


ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
