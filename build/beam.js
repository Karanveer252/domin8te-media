const { spawn } = require('child_process'); const path=require('path'); const os=require('os'); const http=require('http'); const fs=require('fs');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT='C:/Work/domin8te-media'; const PORT=8123;
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.xml':'application/xml','.txt':'text/plain'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0]; if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{ if(e){s.writeHead(404).end();return} s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'text/plain'}); s.end(b) })});
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const dir=path.join(os.tmpdir(),'d8-beam-'+Date.now());
  const proc=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--remote-debugging-port=9455','--user-data-dir='+dir,'--no-first-run','about:blank'],{stdio:'ignore'});
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(250);try{t=(await(await fetch('http://127.0.0.1:9455/json/list')).json()).find(x=>x.type==='page')}catch(e){}}
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0; const w=new Map(); ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data); if(w.has(m.id)){w.get(m.id)(m.result);w.delete(m.id)}});
  const send=(m,p={})=>new Promise(r=>{const i=++id;w.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:`(async()=>{${e}})()`,returnByValue:true,awaitPromise:true});
    return r.exceptionDetails?{ERR:r.exceptionDetails.exception?.description}:r.result.value};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'}); await sleep(2200);
  for (const p of [0.348, 0.366, 0.5]) {
    await ev(`document.documentElement.style.scrollBehavior='auto';
      const f=document.getElementById('film'); scrollTo({top:f.offsetTop+(f.offsetHeight-innerHeight)*${p},behavior:'instant'}); return 1;`);
    await sleep(900);
    console.log('p='+p, JSON.stringify(await ev(`
      const sc=document.querySelector('.scenery');
      const g=n=>getComputedStyle(document.querySelector(n));
      const rd=n=>({w:g(n).strokeWidth,o:(+g(n).opacity).toFixed(2),s:g(n).stroke.slice(0,34)});
      return { pw:getComputedStyle(sc).getPropertyValue('--pw').trim(),
               ten:getComputedStyle(sc).getPropertyValue('--ten').trim(),
               case:rd('.thread--case'), glow:rd('.thread--glow'),
               body:rd('.thread--body'), core:rd('.thread--core') };`), null, 0));
  }
  // magnify the contact region so the beam can actually be judged
  await ev(`document.documentElement.style.scrollBehavior='auto';
    const f=document.getElementById('film'); scrollTo({top:f.offsetTop+(f.offsetHeight-innerHeight)*0.366,behavior:'instant'}); return 1;`);
  await sleep(900);
  const sy=await ev('return Math.round(scrollY)');
  const clip=await send('Page.captureScreenshot',{format:'png',clip:{x:300,y:sy+480,width:520,height:325,scale:2.6}});
  fs.writeFileSync('C:/Work/domin8te-build/shots/zoom-contact.png',Buffer.from(clip.data,'base64'));
  console.log('zoom written');
  ws.close(); proc.kill(); srv.close(); process.exit(0);
})();
