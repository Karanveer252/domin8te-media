/* Local preview server. Serves the deploy folder as is, plus one thing the
   live site never carries: while Karan compares treatments of the jobs
   cards, index.html gets a small switcher injected (preview/cards.js). */
const http=require('http'),fs=require('fs'),path=require('path');
/* `--root <folder>` (or ROOT in the environment) serves a working copy of the site instead of the deploy folder */
const ROOT_ARG=process.argv.indexOf('--root');
const ROOT=(ROOT_ARG>-1&&process.argv[ROOT_ARG+1])||process.env.ROOT||'C:/Work/domin8te-media',PREVIEW='C:/Work/domin8te-build/preview',PORT=Number(process.env.PORT||8080);
/* `--overlay <folder>`: a version of the site that differs in a few files (v2/site holds only those);
   a path found there is served from there, anything else from ROOT */
const OV_ARG=process.argv.indexOf('--overlay'),OVERLAY=OV_ARG>-1?process.argv[OV_ARG+1]:null;
const PORT_ARG=process.argv.indexOf('--port');
function fileFor(p){ if(OVERLAY){ const o=path.join(OVERLAY,p); if(fs.existsSync(o)&&fs.statSync(o).isFile()) return o } return path.join(ROOT,p) }
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
  const f=fileFor(p);
  /* byte ranges for media, as the live host answers them: a <video> cannot seek or loop a large mp4 without them */
  const rng=req.headers.range&&/bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if(rng&&path.extname(f)==='.mp4'){
    fs.stat(f,(e,st)=>{ if(e||!st.isFile()){res.writeHead(404).end('not found');return}
      let start=rng[1]?+rng[1]:st.size-(+rng[2]),end=rng[1]&&rng[2]?+rng[2]:st.size-1;
      if(start>=st.size||start<0){res.writeHead(416,{'Content-Range':'bytes */'+st.size}).end();return}
      end=Math.min(end,st.size-1);
      res.writeHead(206,{'Content-Type':'video/mp4','Content-Range':'bytes '+start+'-'+end+'/'+st.size,'Accept-Ranges':'bytes','Content-Length':end-start+1,'Cache-Control':'no-store'});
      fs.createReadStream(f,{start,end}).pipe(res) });
    return;
  }
  fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404).end('not found');return}
    if(p==='/index.html'){
      let tags='';
      for(const sw of ['cards.js','photos.js','workidx.js','feel.js','header.js']) if(fs.existsSync(path.join(PREVIEW,sw))) tags+='\n<script src="/__preview/'+sw+'"></script>';
      if(tags) b=Buffer.from(b.toString('utf8').replace('<head>','<head>'+tags),'utf8');
    }
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); res.end(b) });
}).listen(PORT_ARG>-1?Number(process.argv[PORT_ARG+1]):PORT,()=>console.log('preview on http://localhost:'+(PORT_ARG>-1?process.argv[PORT_ARG+1]:PORT)+(OVERLAY?' (overlay '+OVERLAY+')':'')));
