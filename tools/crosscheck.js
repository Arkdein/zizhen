// node tools/crosscheck.js — every quote attributed to a prescribed text must occur in that text's ORIGINAL
const fs=require('fs'),vm=require('vm');
const P=/[，。、；：？！“”‘’「」『』（）《》〈〉—…·\s,.;:?!"'()⟨⟩]/g;
const NAMES={taohua:'桃花源记',zouji:'邹忌讽齐王纳谏',mashuo:'马说',zongqiu:'纵囚论',liujingting:'柳敬亭说书'};
const T={},ORIG={};
for(const f of fs.readdirSync('data/texts')){const s=fs.readFileSync('data/texts/'+f,'utf8');const id=f.replace('.js','');
  ORIG[id]=(s.match(/ORIGINAL[^\n]*\n([\s\S]*?)\nORIGINAL/)||[])[1].replace(P,'');
  vm.runInNewContext(s,{ZZ:{addText:t=>T[id]=t}});}
let bad=0,n=0;
function chk(where,s,src){ if(!s||!src) return; const id=Object.keys(NAMES).find(k=>src.includes(NAMES[k])); if(!id||!ORIG[id]) return; n++;
  const q=s.replace(P,'').replace(/……|…/g,''); const parts=s.split(/……|…/).map(x=>x.replace(P,'')).filter(Boolean);
  if(!parts.every(x=>ORIG[id].includes(x))){bad++;console.log(where,'|',src,'|',s);} }
for(const [id,t] of Object.entries(T)){
  for(const [w,L] of Object.entries(t.lex)) (L.senses||[]).forEach(se=>(se.ex||[]).forEach(x=>chk(id+' lex '+w,x.s,x.src)));
  t.mcq.forEach((q,i)=>{ if(q.type==='释义') chk(id+' mcq'+i,q.s,q.src||NAMES[id]); else if(q.type==='辨析') q.o.forEach(pr=>pr.forEach(x=>chk(id+' mcq'+i,x.s,x.src))); else q.o.forEach(x=>chk(id+' mcq'+i,x.s,NAMES[id])); });
  t.recall.forEach(r=>{ if(r.kind==='in') chk(id+' '+r.id,r.s,r.src); });
}
console.log({checked:n,mismatches:bad});
