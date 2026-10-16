const L = require('./lib'); const P='file:///C:/Work/domin8te-build/portal/versions/';
const C=P+'console-preview.html', D=P+'v18h.html', B='client/tnt_preview_bayleaf/';
const con=['queue','messages','messages/tnt_preview_bayleaf','bot','bot/bo_1','new','clients','board','billing','billing/tnt_preview_osteria','revenue','revenue/income','revenue/costs','revenue/years','settings'];
const tabs=['overview','work/cards','work/website','work/social','work/advertising','work/local','results','talk','home','visible','view','setup','advanced','bot','billing','inbox'];
const dash=['home','work','results','billing','billing/change','messages','settings','help'];
(async()=>{ const b=await L.open(); const nm=s=>s.replace(/[\/]/g,'_');
 await b.size(1440); await b.go(C+'#/queue',3500);
 for(const r of con){ await b.hash('#/'+r,2200); await b.shot('c-'+nm(r)); }
 for(const t of tabs){ await b.hash('#/'+B+t,2200); await b.shot('t-'+nm(t)); }
 // extras
 await b.hash('#/queue',2000); await b.key('k','KeyK',2); await L.sleep(800); await b.viewport('x-ctrlk');
 await b.key('Escape','Escape'); 
 await b.hash('#/revenue',2200); await b.ev(`(document.getElementById('rv-qa-btn')||{click(){}}).click()`); await L.sleep(800); await b.viewport('x-addcost');
 await b.key('Escape','Escape'); await b.ev(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);
 await b.hash('#/bot',2200); await b.ev(`(document.querySelector('[data-bot-snooze]')||{click(){}}).click()`); await L.sleep(600); await b.viewport('x-snooze');
 await b.size(390,844); await b.hash('#/queue',2000); await b.shot('p-queue',{cap:1800});
 await b.theme('dark'); await b.size(1440); await b.hash('#/queue',2000); await b.shot('d-queue',{cap:1400}); await b.hash('#/revenue',2200); await b.shot('d-revenue',{cap:1800}); await b.theme('light');
 await b.go(D+'#/home',4000);
 for(const r of dash){ await b.hash('#/'+r,2200); await b.shot('d-'+nm(r)); }
 await b.go(P+'console-demo.html#/queue',4000); await b.shot('demo-queue',{cap:1400});
 b.close(); process.exit(0)})();
