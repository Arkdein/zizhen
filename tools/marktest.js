// node tools/marktest.js — runs the app's marker over every recall item
const fs=require('fs'),vm=require('vm');
const ctx={window:{},console};ctx.window=ctx;ctx.ZZ={ORDER:[],texts:{},addText(t){this.texts[t.id]=t;}};
for(const f of fs.readdirSync('data/texts')) vm.runInNewContext(fs.readFileSync('data/texts/'+f,'utf8'),ctx);
// extract marker functions from app.js
const src=fs.readFileSync('js/app.js','utf8');
const a=src.indexOf('const STRIP'), b=src.indexOf('const markStr');
const m={}; vm.runInNewContext(src.slice(a,b)+';M.autoMark=autoMark;M.splitAns=splitAns;',{M:m});
let bad=0,n=0,modelOk=0;
for(const T of Object.values(ctx.ZZ.texts)) for(const it of T.recall){
  n++;
  for(const t of ['2','1.5','1']) for(const ans of (it.ans[t]||[])){ const r=m.autoMark(it,ans); if(r.status!=='auto'||r.mark!=+t){bad++; console.log('MISMATCH',it.id,t,JSON.stringify(ans),JSON.stringify(r));} }
  const r=m.autoMark(it,it.model); if(r.status==='auto'&&r.mark===2) modelOk++; else if(process.argv[2]) console.log('model not auto-full',it.id,it.model,JSON.stringify(r));
}
console.log({items:n,listedAnswerMismatches:bad,modelAutoFull:modelOk});
