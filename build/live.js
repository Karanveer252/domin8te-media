const { spawn } = require('child_process'); const path=require('path'); const os=require('os'); const fs=require('fs');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const dir=path.join(os.tmpdir(),'d8-live-'+Date.now());
  const proc=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--remote-debugging-port=9444',
    '--user-data-dir='+dir,'--no-first-run','about:blank'],{stdio:'ignore'});
  let t=null;
  for(let i=0;i<60&&!t;i++){await sleep(250);try{t=(await(await fetch('http://127.0.0.1:9444/json/list')).json()).find(x=>x.type==='page')}catch(e){}}
  const ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0; const waits=new Map(); const errors=[];
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);
    if(waits.has(m.id)){waits.get(m.id)(m.result);waits.delete(m.id)}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push((m.params.args||[]).map(a=>a.value).join(' '));
    if(m.method==='Network.loadingFailed')errors.push('loadingFailed: '+m.params.errorText+' '+(m.params.type||''));
  });
  const send=(method,params={})=>new Promise(res=>{const i=++id;waits.set(i,res);ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async expr=>{const r=await send('Runtime.evaluate',{expression:`(async()=>{${expr}})()`,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails) return {ERR:r.exceptionDetails.exception?.description||r.exceptionDetails.text}; return r.result.value};
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'https://domin8temedia.com/'});
  await sleep(4000);
  console.log('state:', JSON.stringify(await ev(`
    return { ready: document.readyState, mode: document.documentElement.className,
             world: !!document.getElementById('world'), bands: document.querySelectorAll('.film .band').length,
             bolt: !!document.getElementById('boltPath'), title: document.title,
             htmlLen: document.documentElement.outerHTML.length,
             cssRules: [...document.styleSheets].map(s=>{try{return s.cssRules.length}catch(e){return 'x'}}).join(','),
             fonts: document.fonts.status };`)));
  // scrub the live hero and read the drive's own state
  for (const p of [0,.33,.62,1]) {
    await ev(`document.documentElement.style.scrollBehavior='auto';
      const f=document.getElementById('film'); scrollTo({top:f.offsetTop+(f.offsetHeight-innerHeight)*${p},behavior:'instant'});
      return 1;`);
    await sleep(900);
    console.log('p='+p, JSON.stringify(await ev(`
      const w=document.getElementById('world');
      return { tf: getComputedStyle(w).transform.slice(0,30),
               on: [...document.querySelectorAll('.film .band')].map(b=>b.classList.contains('on')?1:0).join(''),
               lit: [...document.querySelectorAll('.pan.act')].map(x=>x.classList.contains('is-lit')?1:0).join(''),
               dash: getComputedStyle(document.getElementById('boltg')).strokeDashoffset };`)));
  }
  const perf = await ev(`const n=performance.getEntriesByType('navigation')[0];
    const res=performance.getEntriesByType('resource');
    return { loadMs:Math.round(n.loadEventEnd), ttfb:Math.round(n.responseStart),
             kb:Math.round(res.reduce((a,b)=>a+(b.transferSize||0),0)/1024*10)/10,
             files:res.map(r=>r.name.split('/').pop().split('?')[0]+':'+Math.round((r.transferSize||0)/1024*10)/10+'KB') };`);
  console.log('perf:', JSON.stringify(perf));
  await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:2,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await send('Page.navigate',{url:'https://domin8temedia.com/'});
  await sleep(3500);
  console.log('phone:', JSON.stringify(await ev(`return { mode: document.documentElement.className,
     overflow: document.documentElement.scrollWidth+'/'+innerWidth };`)));
  const shot=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('C:/Work/domin8te-build/shots/live-phone.png',Buffer.from(shot.data,'base64'));
  console.log('errors:', JSON.stringify(errors));
  ws.close(); proc.kill(); process.exit(0);
})();
