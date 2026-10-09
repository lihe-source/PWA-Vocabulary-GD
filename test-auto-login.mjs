import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const drive = await readFile(new URL('./drive-service.js', import.meta.url), 'utf8');
const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('startup renders home before any Google reconnect attempt', () => {
  const home = app.indexOf("Router._doNavigate('home')");
  const bootstrap = app.indexOf('const bootstrapGDriveInBackground');
  assert.ok(home >= 0 && bootstrap > home);
  const bootstrapBody = app.slice(bootstrap, app.indexOf('setTimeout(() => { void bootstrapGDriveInBackground()', bootstrap));
  assert.doesNotMatch(bootstrapBody, /await GDrive\.tryRestoreToken\(/);
});

test('ordinary taps never initiate Google authorization', () => {
  assert.doesNotMatch(app, /armSeamlessGoogleReconnect|GDrive\.tryRestoreToken\(/);
  assert.match(html, /accounts\.google\.com\/gsi\/client[^>]*async[^>]*defer[^>]*data-gis="1"/);
});

test('interactive Drive authorization is a single login_hint flow without forced second account confirmation', () => {
  const start = drive.indexOf('async ensureToken(options = {})');
  const end = drive.indexOf('async tryRestoreToken(', start);
  const body = drive.slice(start, end);
  assert.match(body, /promptMode:\s*''/);
  assert.match(body, /accountHint:\s*this\.getUserEmail\(\)/);
  assert.doesNotMatch(body, /select_account|consent/);
});
