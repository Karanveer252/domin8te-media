const L = require('./lib'); const F='file:///C:/Work/domin8te-build/portal/versions/console-preview.html';
(async()=>{ const b=await L.open(); await b.size(1440); await b.go(F+'#/client/tnt_preview_bayleaf/overview',3500);
const q=`JSON.stringify({tabs:[...document.querySelectorAll('[role=tab],.tabs a,nav.tabs a, .ctabs a')].map(a=>(a.getAttribute('href')||a.id)+'|'+a.textContent.trim().replace(/[ \n]+/g,' ')), h:location.hash})`;
console.log(await b.ev(q));
for (const r of ['revenue','revenue/income','revenue/costs','revenue/years','bot','settings','billing','board','new','clients','messages']) { await b.hash('#/'+r,1500); console.log(r, await b.ev(`JSON.stringify({sub:[...document.querySelectorAll('#main [role=tab], #main .seg a, #main .tabs a, #main a[href^="#/${r.split('/')[0]}/"]')].slice(0,14).map(a=>(a.getAttribute('href')||'')+'|'+a.textContent.trim().replace(/[ \n]+/g,' ').slice(0,25)), h:document.documentElement.scrollHeight})`)); }
b.close(); process.exit(0)})();
