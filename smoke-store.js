// 冒烟测试：数据层双模式（Web localStorage / 原生 Preferences）+ SRS 纯函数
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadStore(win, localStorage) {
  const sandbox = { window: win, localStorage, console };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'store.js'), 'utf8'), context);
  return vm.runInContext('Store', context);
}

function loadSrs() {
  const context = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'srs.js'), 'utf8'), context);
  return vm.runInContext('SRS', context);
}

async function testWeb() {
  const mem = {};
  const localStorage = {
    getItem: k => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
  };
  const Store = loadStore({}, localStorage);
  const d1 = await Store.load();
  console.log('[Web] 首次 load 字符数:', d1.characters.length, '| dailyNew:', d1.settings.dailyNewCount);
  d1.settings.dailyNewCount = 8;
  await Store.save(d1);
  const d2 = await Store.load();
  console.log('[Web] 二次 load dailyNew:', d2.settings.dailyNewCount, '(期望 8)');
}

async function testNative() {
  const mem = {};
  const Preferences = {
    get: async ({ key }) => ({ value: (key in mem ? mem[key] : null) }),
    set: async ({ key, value }) => { mem[key] = value; },
  };
  const Store = loadStore({ Capacitor: { Plugins: { Preferences } } }, null);
  const d1 = await Store.load();
  console.log('[Native] 首次 load 字符数:', d1.characters.length, '| dailyNew:', d1.settings.dailyNewCount);
  d1.settings.dailyNewCount = 12;
  await Store.save(d1);
  const d2 = await Store.load();
  console.log('[Native] 二次 load dailyNew:', d2.settings.dailyNewCount, '(期望 12)');
}

let failed = 0;
function check(label, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${label} → ${actual}${ok ? '' : `（期望 ${expected}）`}`);
}

// 改正今日标记：改的结果要同时修正「今日分类」和「复习阶段」
function testSetTodayResult() {
  const SRS = loadSrs();
  const today = SRS.todayStr();
  const yesterday = SRS.addDays(today, -1);

  // 场景：孩子已经学到阶段 3，今天误点了「不认识」（阶段被打回 0）
  const card = {
    char: '一', learned: true, stage: 3, nextReview: today,
    learnedAt: yesterday, history: [{ date: yesterday, result: 'know' }],
  };
  SRS.review(card, 'dontknow');
  check('误点后阶段归零', card.stage, 0);
  check('误点后今日结果', SRS.todayResult(card), 'dontknow');

  // 家长改回「认识」
  SRS.setTodayResult(card, 'know');
  check('改回后阶段恢复', card.stage, 2); // 昨天 know→1，今天 know→2
  check('改回后今日结果', SRS.todayResult(card), 'know');
  check('改回后下次复习已重算', card.nextReview, SRS.addDays(today, SRS.INTERVALS[2]));
  check('history 没有被追加（只改写最后一条）', card.history.length, 2);

  // 改「模糊」：阶段不变
  SRS.setTodayResult(card, 'vague');
  check('改成模糊后阶段不变', card.stage, 1); // 昨天 know→1，今天 vague→1
  check('改成模糊后今日结果', SRS.todayResult(card), 'vague');

  // 连点掌握：阶段封顶到 6，nextReview 变 null
  const c2 = { char: '二', learned: true, stage: 5, nextReview: today, learnedAt: yesterday,
               history: Array.from({ length: 5 }, () => ({ date: yesterday, result: 'know' })) };
  SRS.setTodayResult(c2, 'know');
  check('阶段封顶到 6', c2.stage, 6);
  check('已掌握后 nextReview 为 null', c2.nextReview, null);

  // 今天还没标记过的字：应补一条今天的记录，而不是报错
  const c3 = { char: '三', learned: false, stage: 0, nextReview: null, learnedAt: null, history: [] };
  SRS.setTodayResult(c3, 'know');
  check('未学过的字补标记后 stage', c3.stage, 1);
  check('未学过的字补标记后 learned', c3.learned, true);
  check('未学过的字补标记后 learnedAt', c3.learnedAt, today);
  check('未学过的字补标记后 history 长度', c3.history.length, 1);
  check('今天没答过时 todayResult 为 null', SRS.todayResult({ history: [] }), null);

  // 同日多条记录：改最后一条，前面的仍然生效
  const c4 = { char: '四', learned: true, stage: 0, nextReview: today, learnedAt: today,
               history: [{ date: today, result: 'dontknow' }, { date: today, result: 'dontknow' }] };
  SRS.setTodayResult(c4, 'know');
  check('同日多条只改最后一条', c4.history.map(h => h.result).join(','), 'dontknow,know');
  check('重放后阶段', c4.stage, 1); // dontknow→0, know→1

  // 修正后今日分类要跟着变
  const t = SRS.todayLearned([card, c2, c3, c4]);
  check('今日 · 认识', t.know.join(''), '二三四');
  check('今日 · 模糊', t.vague.join(''), '一');
  check('今日 · 不认识', t.dontknow.length, 0);
}

// 今日总结的口径：按「当天最后一次」结果分类，每个字只出现一次；昨天的不算
function testTodayLearned() {
  const SRS = loadSrs();
  const today = SRS.todayStr();
  const yesterday = SRS.addDays(today, -1);
  const chars = [
    { char: '一', history: [{ date: today, result: 'dontknow' }, { date: today, result: 'know' }] },
    { char: '二', history: [{ date: today, result: 'vague' }] },
    { char: '三', history: [{ date: yesterday, result: 'know' }] },
    { char: '四', history: [] },
    { char: '五' }, // 没有 history 字段，不应抛错
  ];
  const t = SRS.todayLearned(chars);
  const s = SRS.todayStats(chars);
  console.log(`[SRS] todayLearned → 认识 [${t.know}] 模糊 [${t.vague}] 不认识 [${t.dontknow}]`);
  check('「一」答了不认识+认识，归入认识', t.know.join(''), '一');
  check('「二」归入模糊', t.vague.join(''), '二');
  check('没有人归入不认识', t.dontknow.length, 0);
  check('昨天的「三」不计入今天', t.know.includes('三'), false);
  check('总数为 2（一个字只算一次）', s.total, 2);
  check('todayStats 与 todayLearned 同口径', `${s.know}${s.vague}${s.dontknow}`, '110');
  check('空数组返回全 0', SRS.todayStats([]).total, 0);
}

(async () => {
  await testWeb();
  await testNative();
  testTodayLearned();
  testSetTodayResult();
  if (failed) throw new Error(`${failed} 项断言未通过`);
  console.log('SMOKE OK');
})().catch(e => { console.error('SMOKE FAIL', e); process.exit(1); });
