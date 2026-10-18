const { chromium } = require('playwright');
// Usage: node tests/live-qa.js <url>   (defaults to the local index.html)
const path = require('path');
const URL = process.argv[2] || 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOTS = process.env.SHOTS_DIR || 'qa-screenshots';
require('fs').mkdirSync(SHOTS, { recursive: true });
const fails = []; const ok = m => console.log('  ✓ ' + m); const bad = m => { fails.push(m); console.log('  ✗ ' + m); };
const check = (c, m) => c ? ok(m) : bad(m);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  console.log('Testing', URL);
  const resp = await page.goto(URL, { waitUntil: 'load' });
  check(resp === null || resp.ok(), 'page loads (HTTP ' + (resp ? resp.status() : 'file') + ')');
  if (URL.startsWith('http')) {
    const fontsOk = await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('700 16px "Bricolage Grotesque"')));
    check(fontsOk, 'web fonts load from Google Fonts');
  }
  await page.screenshot({ path: SHOTS + '/desktop-home.png' });
  const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(120); };
  const ids = await page.evaluate(() => LESSONS.map(l => l.id));
  console.log('Lessons:', ids.length);
  check(ids.length === 17, '17 lessons loaded');

  console.log('Quizzes + completion');
  for (const id of ids) {
    await go(id);
    const quiz = await page.evaluate(i => LESSONS.find(l => l.id === i).quiz.map(q => ({ n: q.o.length, c: q.o.findIndex(o => o[1]), cc: q.o.filter(o => o[1]).length })), id);
    if (quiz.some(q => q.cc !== 1)) bad(`${id}: a question without exactly one correct option`);
    if (quiz.length < 3 || quiz.length > 4) bad(`${id}: quiz has ${quiz.length} questions`);
    for (let qi = 0; qi < quiz.length; qi++) {
      const pick = qi === 0 ? (quiz[qi].c + 1) % quiz[qi].n : quiz[qi].c; // first one wrong
      await page.click(`#quiz-${id} [data-q="${qi}"][data-o="${pick}"]`);
      const whys = await page.$$eval(`#quiz-${id} .q:nth-child(${qi + 1}) .why`, e => e.length);
      if (whys !== quiz[qi].n) bad(`${id} q${qi}: ${whys} explanations shown for ${quiz[qi].n} options`);
    }
    const wrong = await page.$$eval(`#quiz-${id} .opt.is-wrong`, e => e.length);
    if (wrong !== 1) bad(`${id}: expected 1 wrong mark, got ${wrong}`);
    // clicking again should not change answer
    await page.click(`#quiz-${id} [data-q="0"][data-o="${quiz[0].c}"]`, { force: true });
    const stillWrong = await page.$$eval(`#quiz-${id} .opt.is-wrong`, e => e.length);
    if (stillWrong !== 1) bad(`${id}: answer changed after lock`);
    const done = await page.$eval(`.nav-link[href="#${id}"]`, e => e.classList.contains('done'));
    if (!done) bad(`${id}: not auto-completed after passing (n-1 correct)`);
  }
  ok('all quizzes answered; explanations for every option; locking works');
  const doneCount = await page.$$eval('.nav-link.done', e => e.length);
  check(doneCount === 17, `sidebar shows ${doneCount}/17 completed`);
  const pct = await page.$eval('.overall-row b', e => e.textContent);
  check(pct === '100%', 'overall progress 100% (' + pct + ')');

  console.log('Retry, mark complete toggle');
  await go('pm-1');
  await page.click('[data-action="quiz-retry"]');
  check(await page.$$eval('#quiz-pm-1 .why', e => e.length) === 0, 'retry clears answers');
  await page.click('.complete-btn');
  check(!(await page.$eval('.nav-link[href="#pm-1"]', e => e.classList.contains('done'))), 'mark-complete toggles off');
  await page.click('.complete-btn');
  check(await page.$eval('.nav-link[href="#pm-1"]', e => e.classList.contains('done')), 'mark-complete toggles on');
  // fail a quiz: all wrong → not pass message
  await go('pm-2');
  await page.click('[data-action="quiz-retry"]');
  const q2 = await page.evaluate(() => LESSONS.find(l => l.id === 'pm-2').quiz.map(q => q.o.findIndex(o => !o[1])));
  for (let i = 0; i < q2.length; i++) await page.click(`#quiz-pm-2 [data-q="${i}"][data-o="${q2[i]}"]`);
  check((await page.$eval('#quiz-pm-2 .quiz-sum', e => e.textContent)).includes('retry'), 'failing quiz shows retry guidance');

  console.log('Classify, reveal, draft, RICE');
  await go('pm-1');
  await page.click('#cls-pm-1 [data-i="0"][data-b="0"]');
  await page.click('#cls-pm-1 [data-i="1"][data-b="0"]');
  await page.click('#cls-pm-1 [data-action="cls-check"]');
  check(await page.$$eval('#cls-pm-1 .cls-row.ok', e => e.length) === 1 && await page.$$eval('#cls-pm-1 .cls-row.no', e => e.length) === 1, 'classify marks right & wrong');
  await page.click('[data-action="reveal"]');
  check(await page.$eval('#model-pm-1', e => !e.hidden), 'reveal model answer');
  await go('pm-2');
  await page.fill('#draft-pm-2', 'My JTBD draft');
  await page.waitForTimeout(500);
  await go('pm-4');
  const before = await page.$eval('#rice-rank', e => e.textContent);
  await page.selectOption('#rice-1-i', '3');
  await page.selectOption('#rice-1-c', '1');
  const after = await page.$eval('#rice-rank', e => e.textContent);
  check(before !== after && after.startsWith('Ranking: 1. AI summary tone control'), 'RICE ranking updates live: ' + after);

  console.log('Persistence after reload');
  await page.reload(); await page.waitForTimeout(200);
  check(await page.$$eval('.nav-link.done', e => e.length) === 17, 'completion persists');
  await go('pm-2');
  check(await page.$eval('#draft-pm-2', e => e.value) === 'My JTBD draft', 'draft persists');
  await go('pm-4');
  check(await page.$eval('#rice-1-i', e => e.value) === '3', 'RICE inputs persist');

  console.log('Simulator');
  await go('simulator');
  const steps = await page.evaluate(() => SIM.steps.map(s => s.options.reduce((bi, o, i, a) => o.s > a[bi].s ? i : bi, 0)));
  check(steps.length === 8, '8 simulator steps');
  for (let i = 0; i < steps.length; i++) {
    await page.click(`[data-action="sim-pick"][data-o="${steps[i]}"]`);
    check(await page.$('#sim-fb') !== null, `step ${i + 1}: feedback shown`);
    await page.click('[data-action="sim-next"]');
  }
  const score = await page.$eval('.score-big', e => e.textContent);
  check(score === '100%', 'best path scores 100%');
  check(await page.$$eval('.recap li', e => e.length) === 8, 'recap lists 8 decisions');
  await page.click('.scene [data-action="sim-restart"]');
  check(await page.$('#scene-title') !== null, 'restart returns to step 1');
  // worst path
  const worst = await page.evaluate(() => SIM.steps.map(s => s.options.reduce((bi, o, i, a) => o.s < a[bi].s ? i : bi, 0)));
  for (let i = 0; i < worst.length; i++) { await page.click(`[data-action="sim-pick"][data-o="${worst[i]}"]`); await page.click('[data-action="sim-next"]'); }
  check((await page.$eval('.score-big', e => e.textContent)) === '0%', 'worst path scores 0%');
  check((await page.$eval('.sidebar', e => e.textContent)).includes('Best score 100%'), 'best score kept in sidebar');
  // mid-sim persistence
  await page.click('.scene [data-action="sim-restart"]');
  await page.click('[data-action="sim-pick"][data-o="1"]'); await page.click('[data-action="sim-next"]');
  await page.reload(); await page.waitForTimeout(200);
  check((await page.$eval('.scene-tag', e => e.textContent)).includes('Decision 2'), 'in-progress simulator resumes after reload');

  console.log('Flashcards');
  await go('flashcards');
  await page.click('#fc-card');
  check(await page.$eval('#fc-card', e => e.classList.contains('flipped')), 'card flips on click');
  await page.keyboard.press('Space');
  check(!(await page.$eval('#fc-card', e => e.classList.contains('flipped'))), 'space flips back');
  const pos1 = await page.$eval('.fc-pos', e => e.textContent);
  await page.click('[data-action="fc-know"]');
  const pos2 = await page.$eval('.fc-pos', e => e.textContent);
  check(pos1 !== pos2 && pos2.includes('1/79 known'), 'know-it advances and counts: ' + pos2);
  await page.keyboard.press('ArrowRight');
  check((await page.$eval('.fc-pos', e => e.textContent)).startsWith('Card 3'), 'arrow key moves');
  await page.click('[data-action="fc-filter"][data-v="learning"]');
  check((await page.$eval('.fc-pos', e => e.textContent)).includes('/ 78'), 'still-learning deck excludes known');
  await page.click('[data-action="fc-shuffle"]');
  check(await page.$('#fc-card') !== null, 'shuffle keeps a card on screen');

  console.log('Glossary');
  await go('glossary');
  await page.fill('#gl-q', 'velocity');
  const n = await page.$$eval('.gl-item', e => e.length);
  check(n >= 1 && n < 10, `search "velocity" → ${n} results`);
  await page.fill('#gl-q', '');
  await page.click('[data-action="gl-filter"][data-v="sg"]');
  const sgCount = await page.$$eval('.gl-item', e => e.length);
  const sgBadges = await page.$$eval('.gl-item .badge.sg', e => e.length);
  check(sgCount > 20 && sgCount === sgBadges, `Scrum Guide filter shows ${sgCount} official terms`);
  await page.fill('#gl-q', 'zzzz');
  check(await page.$('.empty') !== null, 'empty state for no results');

  console.log('Design system (purple on black, dark only)');
  check(await page.$('[data-action="theme"]') === null, 'no theme toggle');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(bg === 'rgb(9, 7, 15)', 'black body background ' + bg);
  const btn = await page.evaluate(() => { location.hash = 'home'; return new Promise(r => setTimeout(() => r(getComputedStyle(document.querySelector('.btn-primary')).backgroundColor), 150)); });
  check(btn === 'rgb(124, 58, 237)', 'primary button is purple ' + btn);
  await page.emulateMedia({ colorScheme: 'light' });
  check(await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(9, 7, 15)', 'stays dark when the OS prefers light');
  await page.emulateMedia({ colorScheme: null });

  console.log('Course search');
  await go('home');
  await page.click('.sidebar [data-action="search-open"]');
  check(await page.isVisible('#search-q'), 'search panel opens from the sidebar');
  check((await page.$$eval('#search-results [data-action="search-suggest"]', e => e.length)) > 0, 'empty search shows suggestions');
  await page.fill('#search-q', 'velocity'); await page.waitForTimeout(100);
  const kinds = await page.$$eval('.sr-item', e => e.map(x => x.dataset.kind));
  check(kinds.includes('glossary') && kinds.includes('lesson'), `"velocity" finds lessons and glossary terms (${kinds.length} results)`);
  const firstLesson = kinds.indexOf('lesson');
  for (let k = 0; k < firstLesson; k++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  check(!(await page.isVisible('#search-q')), 'panel closes after picking a result');
  check((await page.evaluate(() => location.hash)) === '#scrum-5', 'velocity opens Scrum lesson 5 (' + await page.evaluate(() => location.hash) + ')');
  check((await page.$$eval('#main mark.hit', e => e.length)) > 0, 'matches are highlighted in the lesson');
  await page.keyboard.press('/');
  check(await page.isVisible('#search-q'), '"/" opens search');
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('#search-q')), 'Esc closes search');
  await page.keyboard.press('Control+k');
  check(await page.isVisible('#search-q'), 'Ctrl+K opens search');
  await page.fill('#search-q', 'qwertyzz'); await page.waitForTimeout(100);
  check((await page.$eval('#search-results', e => e.textContent)).includes('Nothing matches'), 'no-results message');
  await page.fill('#search-q', 'little'); await page.waitForTimeout(100);
  const gi = await page.$$eval('.sr-item', e => e.findIndex(x => x.dataset.kind === 'glossary'));
  await page.click(`#sr-${gi}`); await page.waitForTimeout(300);
  check((await page.evaluate(() => location.hash)) === '#glossary' && (await page.$eval('#gl-q', e => e.value)).toLowerCase().startsWith('little'), 'glossary result opens the filtered glossary');
  await page.click('.sidebar [data-action="search-open"]');
  await page.fill('#search-q', 'sprint goal'); await page.waitForTimeout(100);
  const sn = await page.$$eval('.sr-item mark', e => e.length);
  check(sn > 0, 'multi-word query highlights both words in results');
  await page.click('.search-scrim', { position: { x: 5, y: 5 } });
  check(!(await page.isVisible('#search-q')), 'clicking outside closes search');

  console.log('Reset');
  await page.click('[data-action="reset"]'); await page.click('[data-action="reset"]');
  check(await page.$$eval('.nav-link.done', e => e.length) === 0, 'reset clears completion');

  // Print cheat sheet
  console.log('Print');
  await go('cheatsheet');
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: SHOTS + '/cheat-sheet.pdf', format: 'A4', printBackground: true });
  const pdf = require('fs').readFileSync(SHOTS + '/cheat-sheet.pdf');
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check(pages === 1, `cheat sheet prints on ${pages} A4 page(s)`);
  await page.emulateMedia({ media: 'screen' });

  check(errors.length === 0, 'no console/page errors: ' + JSON.stringify(errors));

  console.log('Storage blocked');
  const ctx2 = await browser.newContext();
  await ctx2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  const p2 = await ctx2.newPage(); const e2 = [];
  p2.on('pageerror', e => e2.push(e.message));
  await p2.goto(URL + '#pm-3', { waitUntil: 'load' }); await p2.waitForTimeout(200);
  check(await p2.$('.storage-note') !== null, 'storage warning shown');
  await p2.click('#quiz-pm-3 [data-q="0"][data-o="3"]');
  check(await p2.$$eval('#quiz-pm-3 .why', e => e.length) === 4, 'quiz works without storage');
  await p2.evaluate(() => { location.hash = 'simulator'; }); await p2.waitForTimeout(100);
  await p2.click('[data-action="sim-pick"][data-o="1"]');
  check(await p2.$('#sim-fb') !== null, 'simulator works without storage');
  check(e2.length === 0, 'no errors with storage blocked ' + JSON.stringify(e2));

  console.log('Mobile');
  const ctx3 = await browser.newContext({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
  const p3 = await ctx3.newPage();
  const routes = ['home', ...ids, 'glossary', 'flashcards', 'simulator', 'cheatsheet'];
  let overflow = [];
  await p3.goto(URL, { waitUntil: 'load' });
  for (const r of routes) {
    await p3.evaluate(x => { location.hash = x; }, r); await p3.waitForTimeout(100);
    const w = await p3.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (w[0] > w[1]) overflow.push(`${r}:${w[0]}`);
  }
  check(overflow.length === 0, 'no horizontal page scroll at 375px ' + overflow.join(' '));
  await p3.click('[data-action="menu"]'); await p3.waitForTimeout(350);
  check(await p3.$eval('#sidebar', e => e.classList.contains('open')), 'mobile menu opens');
  await p3.click('#sidebar a[href="#scrum-2"]'); await p3.waitForTimeout(350);
  check(!(await p3.$eval('#sidebar', e => e.classList.contains('open'))) && (await p3.$eval('#page-title', e => e.textContent)).includes('accountabilities'), 'nav closes drawer and routes');
  await p3.screenshot({ path: SHOTS + '/mobile-lesson.png' });
  await p3.click('.topbar [data-action="search-open"]'); await p3.waitForTimeout(200);
  const box = await p3.$eval('.search-panel', e => { const r = e.getBoundingClientRect(); return [r.width, window.innerWidth, document.documentElement.scrollWidth]; });
  check(box[0] === box[1] && box[2] <= box[1], 'mobile: top-bar search opens full width with no sideways scroll');
  await p3.fill('#search-q', 'retrospective'); await p3.waitForTimeout(100);
  await p3.screenshot({ path: SHOTS + '/mobile-search.png' });
  await p3.click('#search-close');

  await browser.close();
  console.log(fails.length ? `\nFAILURES: ${fails.length}` : '\nALL CHECKS PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
