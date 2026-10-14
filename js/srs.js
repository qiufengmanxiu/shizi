/* 儿童识字 App —— 艾宾浩斯遗忘曲线复习算法（纯函数，不接触 DOM） */
const SRS = (() => {
  // 每个阶段对应的复习间隔（天），索引即阶段号。
  // 阶段 0..5 依次为 1、2、4、7、15、30 天后复习；达到 MASTER_STAGE 视为已掌握。
  const INTERVALS = [1, 2, 4, 7, 15, 30];
  const MASTER_STAGE = INTERVALS.length; // 6
  const RESULTS = ['know', 'vague', 'dontknow'];

  function pad(n) { return String(n).padStart(2, '0'); }

  function toDateStr(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function todayStr() {
    return toDateStr(new Date());
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return toDateStr(d);
  }

  // 对一张卡片应用复习结果，原地修改并返回。
  // result: 'know' | 'vague' | 'dontknow'
  function review(card, result) {
    const today = todayStr();

    if (result === 'know') {
      card.stage = Math.min(card.stage + 1, MASTER_STAGE);
    } else if (result === 'dontknow') {
      card.stage = 0; // 忘记 → 从头复习
    }
    // 'vague'：阶段保持不变，按原间隔再复习

    card.learned = true;
    if (!card.learnedAt) card.learnedAt = today;

    card.nextReview = card.stage >= MASTER_STAGE ? null : addDays(today, INTERVALS[card.stage]);

    if (!Array.isArray(card.history)) card.history = [];
    card.history.push({ date: today, result });
    return card;
  }

  function isMastered(card) {
    return card.learned && card.stage >= MASTER_STAGE;
  }

  function isDue(card, today) {
    return card.learned && card.stage < MASTER_STAGE && !!card.nextReview && card.nextReview <= today;
  }

  // 计算今天要复习和要新学的字
  function buildQueue(characters, settings) {
    const today = todayStr();
    const dailyNew = settings.dailyNewCount || 5;

    const reviewQueue = characters
      .filter(c => isDue(c, today))
      .sort((a, b) => a.nextReview.localeCompare(b.nextReview));

    // 用「今天已新学的字数」控制每日新字上限
    const newLearnedToday = characters.filter(c => c.learnedAt === today).length;
    const remainingNew = Math.max(0, dailyNew - newLearnedToday);

    const newQueue = characters
      .filter(c => !c.learned)
      .slice(0, remainingNew);

    return { reviewQueue, newQueue, today };
  }

  // 某个字今天的最后一次结果（'know'|'vague'|'dontknow'）；今天没答过返回 null
  function todayResult(card) {
    const today = todayStr();
    const hist = card.history || [];
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      if (h && h.date === today && RESULTS.indexOf(h.result) !== -1) return h.result;
    }
    return null;
  }

  // 今天学过的字，按结果分类：{ know: ['一','二'], vague: [...], dontknow: [...] }
  // 同一个字今天若答过多次，按「当天最后一次」的结果归类，保证每个字只出现一次。
  // 跨多次学习会话、跨 app 重启都算数，所以是完整一天的数据。
  function todayLearned(characters) {
    const byResult = { know: [], vague: [], dontknow: [] };
    characters.forEach(c => {
      const r = todayResult(c);
      if (r) byResult[r].push(c.char);
    });
    return byResult;
  }

  // 今日各结果的数量（与 todayLearned 同口径：一个字只算一次）
  function todayStats(characters) {
    const byResult = todayLearned(characters);
    const know = byResult.know.length;
    const vague = byResult.vague.length;
    const dontknow = byResult.dontknow.length;
    return { know, vague, dontknow, total: know + vague + dontknow };
  }

  // 用整条 history 重算卡片的派生状态。
  // stage 本身就是 history 的折叠结果（know +1 / vague 不变 / dontknow 归 0），
  // 所以改掉某次结果后重放一遍就能得到正确的阶段，无需另外记录「修改前的阶段」。
  function recompute(card) {
    const hist = Array.isArray(card.history) ? card.history : [];
    let stage = 0;
    hist.forEach(h => {
      if (!h) return;
      if (h.result === 'know') stage = Math.min(stage + 1, MASTER_STAGE);
      else if (h.result === 'dontknow') stage = 0;
    });
    card.stage = stage;
    // learned / learnedAt 只置位、不清除：答过一次就不再算「未学」
    if (hist.length) {
      card.learned = true;
      if (!card.learnedAt) card.learnedAt = hist[0].date;
    }
    const last = hist[hist.length - 1];
    card.nextReview = (!last || stage >= MASTER_STAGE) ? null : addDays(last.date, INTERVALS[stage]);
    return card;
  }

  // 改正某个字「今天」的结果（家长发现孩子点错了时用）。
  // 今天已有记录则改写最后一条，没有则补一条（等同今天补答一次），然后重算卡片状态。
  function setTodayResult(card, result) {
    const today = todayStr();
    if (!Array.isArray(card.history)) card.history = [];
    let idx = -1;
    for (let i = card.history.length - 1; i >= 0; i--) {
      if (card.history[i] && card.history[i].date === today) { idx = i; break; }
    }
    if (idx === -1) card.history.push({ date: today, result });
    else card.history[idx].result = result;
    return recompute(card);
  }

  return { INTERVALS, MASTER_STAGE, todayStr, addDays, review, isMastered, isDue, buildQueue,
           todayResult, todayLearned, todayStats, recompute, setTodayResult };
})();
