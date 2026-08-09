import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const text = name => readFile(new URL(`./${name}`, import.meta.url), 'utf8');

test('all public app surfaces use the V7.2.0 cache/version', async () => {
  const [app, html, sw, version, manifest] = await Promise.all([
    text('app.js'), text('index.html'), text('sw.js'), text('version.json'), text('manifest.json')
  ]);
  assert.match(app, /APP_VERSION = 'V7_2_0'/);
  assert.match(html, /app\.js\?v=V7_2_0/);
  assert.match(sw, /Voc-PWA-V7_2_0/);
  assert.match(sw, /study-streak\.js\?v=V7_2_0/);
  assert.equal(JSON.parse(version).schemaVersion, 8);
  assert.match(JSON.parse(manifest).name, /V7\.2\.0/);
});

test('all four completed practice paths record a qualifying activity', async () => {
  const app = await text('app.js');
  for (const activity of ['WORD_QUIZ', 'READING_QUIZ', 'ESSAY_REVIEW', 'AI_ASK']) {
    assert.match(app, new RegExp(`recordStudyActivity\\(STUDY_ACTIVITY_TYPES\\.${activity}`));
  }
});

test('settings backup and Google Drive payload include study days', async () => {
  const app = await text('app.js');
  assert.match(app, /studyDays: StudyStreak\.getDays\(\)/);
  assert.match(app, /study_days_\$\{compactDateTag\}\.csv/);
  assert.match(app, /vocab_study_streak\.json/);
  assert.match(app, /gd-streak-sync-btn/);
});
