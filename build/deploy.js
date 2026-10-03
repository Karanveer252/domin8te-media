/* Deploy the site to Hostinger over the public REST API.

   Used when the Hostinger MCP connector is not attached to the session. Same
   three steps the connector performs:
     1. POST /api/hosting/v1/files/upload-urls   -> {url, auth_key, rest_auth_key}
     2. TUS 1.0.0 upload of the zip into the website's public_html
     3. POST /api/hosting/v1/accounts/{username}/websites/{domain}/deploy
        with {archive_path} -> extracts the zip over the live site

   The token is read from the shared .env, never passed on the command line and
   never printed. Step 3 OVERWRITES the live site and cannot be undone, so it
   only runs with an explicit flag.

   usage: node deploy.js upload     (steps 1 and 2; the live site is untouched)
          node deploy.js deploy     (step 3; overwrites the live site)
*/
const fs = require('fs');
const path = require('path');

const ENV = 'C:/Work/skills/generate-skill/.env';
const ZIP = 'C:/Work/domin8te-v36.zip';
const USERNAME = 'u206384584';
const DOMAIN = 'domin8temedia.com';
const ARCHIVE_NAME = 'domin8te-v36.zip';
const API = 'https://developers.hostinger.com';
const STATE = path.join(__dirname, 'deploy-state.json');

const env = Object.fromEntries(fs.readFileSync(ENV, 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=')).map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()]));
const TOKEN = env.HOSTINGER_API_TOKEN;
if (!TOKEN) { console.error('no HOSTINGER_API_TOKEN in ' + ENV); process.exit(1) }

const auth = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' };

async function generateUploadURL() {
  const res = await fetch(API + '/api/hosting/v1/files/upload-urls', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, domain: DOMAIN })
  });
  const txt = await res.text();
  console.log('generateUploadURL:', res.status);
  if (!res.ok) { console.error('  body:', txt.slice(0, 400)); throw new Error('upload-urls ' + res.status) }
  const j = JSON.parse(txt);
  const d = j.data || j;
  if (!d.url || !d.auth_key || !d.rest_auth_key) { console.error('  unexpected shape:', Object.keys(d)); throw new Error('shape') }
  console.log('  upload host:', new URL(d.url).host);
  return d;
}

async function tusUpload(creds) {
  const bytes = fs.readFileSync(ZIP);
  const base = creds.url.replace(/\/+$/, '');
  const target = base + '/' + ARCHIVE_NAME + '?override=true';
  const authHeaders = {
    'X-Auth': creds.auth_key,
    'X-Auth-Rest': creds.rest_auth_key,
    'Tus-Resumable': '1.0.0'
  };

  console.log('creating upload:', ARCHIVE_NAME, bytes.length, 'bytes');
  let res = await fetch(target, {
    method: 'POST',
    headers: { ...authHeaders, 'Upload-Length': String(bytes.length), 'Upload-Offset': '0' }
  });
  console.log('  POST (create):', res.status, res.status === 201 ? 'created' : await res.text().then(t => t.slice(0, 300)));
  if (res.status !== 201) throw new Error('tus create ' + res.status);

  console.log('uploading bytes...');
  res = await fetch(target, {
    method: 'PATCH',
    headers: { ...authHeaders, 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': '0' },
    body: bytes
  });
  const offset = res.headers.get('upload-offset');
  console.log('  PATCH (bytes):', res.status, 'upload-offset:', offset);
  if (res.status !== 204 && res.status !== 200) {
    console.error('  body:', (await res.text()).slice(0, 300));
    throw new Error('tus patch ' + res.status);
  }
  if (offset && Number(offset) !== bytes.length) throw new Error('short upload: ' + offset + ' of ' + bytes.length);
  return bytes.length;
}

async function deployArchive() {
  console.log('DEPLOY: this overwrites the live site');
  const res = await fetch(API + '/api/hosting/v1/accounts/' + USERNAME + '/websites/' + DOMAIN + '/deploy', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ archive_path: ARCHIVE_NAME })
  });
  const txt = await res.text();
  console.log('deployStaticSiteArchive:', res.status, txt.slice(0, 300));
  if (!res.ok) throw new Error('deploy ' + res.status);
  return txt;
}

(async () => {
  const mode = process.argv[2];
  if (mode === 'upload') {
    const creds = await generateUploadURL();
    const n = await tusUpload(creds);
    fs.writeFileSync(STATE, JSON.stringify({ uploaded: ARCHIVE_NAME, bytes: n, at: new Date().toISOString() }, null, 1));
    console.log('UPLOAD OK. The live site is unchanged until "node deploy.js deploy" runs.');
  } else if (mode === 'deploy') {
    if (!fs.existsSync(STATE)) { console.error('no deploy-state.json: run "node deploy.js upload" first'); process.exit(1) }
    await deployArchive();
    console.log('DEPLOY ACCEPTED. Verify the live files now.');
  } else {
    console.error('usage: node deploy.js upload | deploy');
    process.exit(1);
  }
})().catch(e => { console.error('ERROR', e.message); process.exit(1) });
