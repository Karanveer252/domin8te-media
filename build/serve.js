/* Local preview server. Serves the deploy folder as is, plus one thing the
   live site never carries: while Karan compares treatments of the jobs
   cards, index.html gets a small switcher injected (preview/cards.js). */
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='C:/Work/domin8te-media',PREVIEW='C:/Work/domin8te-build/preview',PORT=Number(process.env.PORT||8080);
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.xml':'application/xml','.txt':'text/plain','.json':'application/json',
  '.mp4':'video/mp4','.webp':'image/webp','.woff2':'font/woff2'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p.endsWith('/'))p+='index.html';
  if(p==='/send.php'){ req.resume(); req.on('end',()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}')}); return }
  if(p==='/__preview/photosets.json'){
    /* which photo sets exist: a set is ready when all eight of its files are in assets */
    const names=['site-hero','ad','soc-squash','soc-mussels','soc-tart','soc-bar','soc-hands','soc-front'];
    const ready={}; for(const set of 'bcdef') ready[set]=names.every(n=>fs.existsSync(path.join(ROOT,'assets','mock-'+set+'-'+n+'.webp')));
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(ready)); return;
  }
  if(p.startsWith('/__preview/')){
    const f=path.join(PREVIEW,p.slice('/__preview/'.length));
    fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404).end('not found');return}
      res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); res.end(b) });
    return;
  }
  const f=path.join(ROOT,p);
  fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404).end('not found');return}
    if(p==='/index.html'){
      let tags='';
      for(const sw of ['cards.js','photos.js','workidx.js','feel.js','header.js']) if(fs.existsSync(path.join(PREVIEW,sw))) tags+='\n<script src="/__preview/'+sw+'"></script>';
      if(tags) b=Buffer.from(b.toString('utf8').replace('<head>','<head>'+tags),'utf8');
    }
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); res.end(b) });
}).listen(PORT,()=>console.log('preview on http://localhost:'+PORT));
