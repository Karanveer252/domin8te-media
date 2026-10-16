const L = require('./lib'); const F='file:///C:/Work/domin8te-build/portal/versions/console-preview.html';
(async()=>{ const b=await L.open(); await b.size(1440); await b.go(F+'#/queue',3500);
console.log(await b.ev(`JSON.stringify({nav:[...document.querySelectorAll('a[href^="#/"]')].map(a=>a.getAttribute('href')+'|'+a.textContent.trim().replace(/\s+/g,' ').slice(0,30)).slice(0,60), btns:[...document.querySelectorAll('header button, #topbar button, .side button')].map(x=>x.id+'|'+(x.getAttribute('aria-label')||x.textContent.trim()).slice(0,30)).slice(0,40)})`));
b.close(); process.exit(0)})();
