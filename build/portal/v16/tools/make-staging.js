#!/usr/bin/env node
/*
 * Builds everything the plan release would put on the website, into a STAGING folder (portal/versions/staging), never into
 * the website's own folder: the real portal, the demo portal and the demo console. The release is local until Karan approves
 * the database changes for production and says "deploy"; promoting these files into C:\Work\domin8te-media is then a copy.
 *   node tools/make-staging.js
 * Then: node tools/release-checks.js   (the public-safety searches over what was staged)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PORTAL = path.join(__dirname, '..', '..');
const STAGE = path.join(PORTAL, 'versions', 'staging');
const run = (file, args, env) => execFileSync(process.execPath, [path.join(PORTAL, file), ...args], { stdio: 'inherit', cwd: PORTAL, env: { ...process.env, ...(env || {}) } });

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(path.join(STAGE, 'dashboard', 'demo'), { recursive: true });
fs.mkdirSync(path.join(STAGE, 'console'), { recursive: true });
run(path.join('v16', 'tools', 'build.js'), []);
run('make-dashboard.js', ['--demo-out', path.join(STAGE, 'dashboard', 'demo', 'index.html')]);
run('make-dashboard.js', ['--live', '--live-out', path.join(STAGE, 'dashboard', 'index.html'), '--demo-url', '/dashboard/demo/']);
run('build-console.js', ['--demo-site'], { D8_SITE_DIR: STAGE });
run('build-console.js', []);   // the real console: versions/console.html
console.log(`staged in ${path.relative(process.cwd(), STAGE)}: dashboard/index.html (real), dashboard/demo/index.html, console/index.html (demo console); the real console is versions/console.html`);
