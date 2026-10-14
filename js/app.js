/* 儿童识字 App —— 应用主逻辑（视图切换、学习会话、汉字库、统计、设置） */
const App = (() => {
  let data = null;
  let session = null; // 当前学习会话 { queue, index, totalReview, totalNew }
  let groupOpen = null; // 汉字库各分组的展开状态，首次渲染时按数量决定

  // 汉字库的状态分组与默认展开阈值（超过就默认折叠，避免一次渲染几百行）
  const GROUPS = [
    { key: 'unlearned', label: '未学' },
    { key: 'learning', label: '学习中' },
    { key: 'mastered', label: '已掌握' },
  ];
  const GROUP_AUTO_OPEN_MAX = 100;
  const RESULT_LABELS = { know: '认识', vague: '模糊', dontknow: '不认识' };
  const LONG_PRESS_MS = 500; // 长按多久算长按

  /* ---------- 初始化 ---------- */
  async function init() {
    data = await Store.load();
    bindNav();
    bindLearn();
    bindLibrary();
    bindSettings();
    bindTodayScreen();
    showView('learn');
    // 当天还没点过「开始学习」就先盖住整个 app，展示今日任务
    if (data.settings.previewConfirmedOn !== SRS.todayStr()) showTodayScreen();
  }

  async function save() { await Store.save(data); }
  function invalidateSession() { session = null; }

  /* ---------- 视图切换 ---------- */
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    if (name === 'learn') startSession();
    render(name);
  }

  function bindNav() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => showView(tab.dataset.view));
    });
  }

  function render(name) {
    if (name === 'learn') renderLearn();
    else if (name === 'library') renderLibrary();
    else if (name === 'stats') renderStats();
    else if (name === 'settings') renderSettings();
  }

  /* ---------- 学习 ---------- */
  function startSession() {
    const { reviewQueue, newQueue } = SRS.buildQueue(data.characters, data.settings);
    const queue = reviewQueue
      .map(c => ({ card: c, isNew: false }))
      .concat(newQueue.map(c => ({ card: c, isNew: true })));
    session = { queue, index: 0, totalReview: reviewQueue.length, totalNew: newQueue.length };
  }

  function renderLearn() {
    const empty = document.getElementById('learn-empty');
    const stage = document.getElementById('learn-stage');
    const buttons = document.getElementById('learn-buttons');
    const emptyText = document.getElementById('learn-empty-text');
    const progress = document.getElementById('learn-progress');
    const summary = document.getElementById('learn-summary');

    if (data.characters.length === 0) {
      stage.classList.add('hidden');
      buttons.classList.add('hidden');
      empty.classList.remove('hidden');
      summary.classList.add('hidden');
      emptyText.textContent = '汉字库还是空的，先去添加汉字吧～';
      progress.textContent = '';
      return;
    }

    if (session.index >= session.queue.length) {
      stage.classList.add('hidden');
      buttons.classList.add('hidden');
      empty.classList.remove('hidden');
      emptyText.textContent = '今天的字都学完啦！';
      progress.textContent = '';
      renderTodaySummary();
      return;
    }

    empty.classList.add('hidden');
    stage.classList.remove('hidden');
    buttons.classList.remove('hidden');

    const item = session.queue[session.index];
    document.getElementById('learn-char').textContent = item.card.char;
    progress.textContent = `${session.index + 1} / ${session.queue.length}`;
  }

  // 学习结束后的今日总结：把今天学过的字按 认识/模糊/不认识 分组列出来
  function renderTodaySummary() {
    const t = SRS.todayLearned(data.characters);
    const groups = [
      { title: '认识', chars: t.know, titleCls: 'title-know', charCls: 'is-know' },
      { title: '模糊', chars: t.vague, titleCls: 'title-vague', charCls: 'is-vague' },
      { title: '不认识', chars: t.dontknow, titleCls: 'title-dontknow', charCls: 'is-dontknow' },
    ].filter(g => g.chars.length); // 空分组不显示，避免出现「不认识（0 个）」

    const el = document.getElementById('learn-summary');
    el.innerHTML = '';
    groups.forEach(g => el.appendChild(charGroupEl(g.title, g.chars, g.titleCls, g.charCls)));
    // 今天一个字都没答过（例如全都已掌握）时不显示总结
    el.classList.toggle('hidden', groups.length === 0);
  }

  async function handleAnswer(result) {
    if (!session || session.index >= session.queue.length) return;
    const item = session.queue[session.index];
    SRS.review(item.card, result);
    await save();
    session.index++;
    renderLearn();
  }

  function bindLearn() {
    document.getElementById('learn-buttons').addEventListener('click', e => {
      const btn = e.target.closest('button[data-result]');
      if (btn) handleAnswer(btn.dataset.result);
    });
  }

  /* ---------- 今日任务预览 ---------- */
  function bindTodayScreen() {
    document.getElementById('today-start-btn').addEventListener('click', async () => {
      data.settings.previewConfirmedOn = SRS.todayStr();
      await save();
      document.getElementById('today-screen').classList.add('hidden');
    });
  }

  function showTodayScreen() {
    // 与学习会话同源，保证预览的字和实际要学的完全一致
    const { reviewQueue, newQueue } = SRS.buildQueue(data.characters, data.settings);
    const body = document.getElementById('today-body');
    body.innerHTML = '';

    if (data.characters.length === 0) {
      body.appendChild(todayHint('汉字库还是空的，先去添加汉字吧～'));
    } else if (reviewQueue.length === 0 && newQueue.length === 0) {
      body.appendChild(todayHint('今天没有要学的字啦 🎉'));
    } else {
      if (reviewQueue.length) body.appendChild(charGroupEl('复习', reviewQueue.map(c => c.char), '', ''));
      if (newQueue.length) body.appendChild(charGroupEl('新学', newQueue.map(c => c.char), '', 'is-new'));
    }

    // 字数多时列表很长，顶部给一行总览，不滚动也能看到规模
    const parts = [];
    if (reviewQueue.length) parts.push(`复习 ${reviewQueue.length}`);
    if (newQueue.length) parts.push(`新学 ${newQueue.length}`);
    document.getElementById('today-subtitle').textContent = parts.join(' · ');

    document.getElementById('today-screen').classList.remove('hidden');
  }

  function todayHint(text) {
    const p = document.createElement('p');
    p.className = 'today-empty';
    p.textContent = text;
    return p;
  }

  // 渲染「小标题 + 一排汉字卡片」的分组，今日预览页和今日总结页共用
  function charGroupEl(title, chars, titleClass, charClass) {
    const wrap = document.createElement('div');
    wrap.className = 'today-group';

    const heading = document.createElement('div');
    heading.className = titleClass ? 'today-group-title ' + titleClass : 'today-group-title';
    heading.textContent = `${title}（${chars.length} 个）`;
    wrap.appendChild(heading);

    const box = document.createElement('div');
    box.className = 'today-chars';
    chars.forEach(ch => {
      const el = document.createElement('div');
      el.className = charClass ? 'today-char ' + charClass : 'today-char';
      el.textContent = ch;
      box.appendChild(el);
    });
    wrap.appendChild(box);
    return wrap;
  }

  /* ---------- 汉字库 ---------- */
  function bindLibrary() {
    document.getElementById('add-char-btn').addEventListener('click', addFromInput);
    document.getElementById('add-char-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') addFromInput();
    });

    document.getElementById('sheet-backdrop').addEventListener('click', () => {
      // 长按刚弹出时，紧跟其后的那次 click 会落在这层遮罩上，忽略掉，免得面板刚开就关
      if (Date.now() - sheetOpenedAt < 350) return;
      closeEditSheet();
    });
    document.getElementById('sheet-cancel').addEventListener('click', closeEditSheet);
    document.getElementById('sheet-options').addEventListener('click', e => {
      const btn = e.target.closest('button[data-result]');
      if (btn) applyTodayResult(btn.dataset.result);
    });
  }

  /* ---------- 长按修改今日标记 ---------- */
  let sheetCard = null;
  let sheetOpenedAt = 0;

  // 在 el 上绑长按：按下计时，动了或松手就取消
  function bindLongPress(el, onLongPress) {
    let timer = null, startX = 0, startY = 0;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };

    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.btn-danger')) return; // 删除按钮不触发长按
      cancel();
      startX = e.clientX; startY = e.clientY;
      timer = setTimeout(() => { timer = null; onLongPress(); }, LONG_PRESS_MS);
    });
    // 手指滑动（说明用户在滚列表）就取消
    el.addEventListener('pointermove', e => {
      if (timer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) cancel();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, cancel));
    // 禁掉长按弹出的系统菜单（文字选择/复制）
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  function openEditSheet(card) {
    sheetCard = card;
    sheetOpenedAt = Date.now();

    document.getElementById('sheet-char').textContent = card.char;
    const current = SRS.todayResult(card);
    document.getElementById('sheet-hint').textContent = current
      ? `今天标记的是「${RESULT_LABELS[current]}」，点下面改正`
      : '今天还没标记过，点下面补一个';

    Array.from(document.getElementById('sheet-options').children).forEach(btn => {
      btn.classList.toggle('is-current', btn.dataset.result === current);
    });
    document.getElementById('edit-sheet').classList.remove('hidden');
  }

  function closeEditSheet() {
    sheetCard = null;
    document.getElementById('edit-sheet').classList.add('hidden');
  }

  async function applyTodayResult(result) {
    if (!sheetCard) return;
    const card = sheetCard;
    if (SRS.todayResult(card) === result) { closeEditSheet(); return; } // 没变就不用存
    SRS.setTodayResult(card, result);
    await save();
    invalidateSession(); // 阶段/复习时间都变了，当前学习队列作废
    closeEditSheet();
    renderLibrary();
    showToast(`「${card.char}」已改为${RESULT_LABELS[result]}`);
  }

  async function addFromInput() {
    const input = document.getElementById('add-char-input');
    const raw = input.value.trim();
    if (!raw) return;

    const existing = new Set(data.characters.map(c => c.char));
    const chars = Array.from(new Set(raw.split(''))).filter(ch => /^[一-鿿]$/.test(ch));

    let added = 0;
    chars.forEach(ch => {
      if (existing.has(ch)) return;
      existing.add(ch);
      data.characters.push({
        id: uid(),
        char: ch,
        learned: false,
        stage: 0,
        nextReview: null,
        addedAt: SRS.todayStr(),
        learnedAt: null,
        history: [],
      });
      added++;
    });

    input.value = '';
    if (added === 0) {
      showToast('没有新增（可能已存在或不是汉字）');
    } else {
      await save();
      invalidateSession();
      showToast(`已添加 ${added} 个字`);
    }
    renderLibrary();
  }

  async function deleteChar(id) {
    data.characters = data.characters.filter(c => c.id !== id);
    await save();
    invalidateSession();
    renderLibrary();
  }

  function renderLibrary() {
    const chars = data.characters;
    document.getElementById('library-stats').textContent =
      chars.length ? `共 ${chars.length} 个字 · 长按汉字可修改今日标记` : `共 ${chars.length} 个字`;

    const buckets = { unlearned: [], learning: [], mastered: [] };
    chars.forEach(c => buckets[groupOf(c)].push(c));

    // 首次渲染按各分组数量决定默认展开状态（超过阈值的先折叠，避免一次渲染几百行）
    if (groupOpen === null) {
      groupOpen = {
        unlearned: buckets.unlearned.length <= GROUP_AUTO_OPEN_MAX,
        learning: buckets.learning.length <= GROUP_AUTO_OPEN_MAX,
        mastered: false,
      };
    }

    const box = document.getElementById('char-groups');
    box.innerHTML = '';

    if (chars.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'char-empty';
      empty.textContent = '还没有汉字，在上方输入添加吧～';
      box.appendChild(empty);
      return;
    }

    GROUPS.forEach(g => box.appendChild(charGroupSection(g.key, g.label, buckets[g.key])));
  }

  function groupOf(c) {
    if (!c.learned) return 'unlearned';
    return SRS.isMastered(c) ? 'mastered' : 'learning';
  }

  function charGroupSection(key, label, cards) {
    const open = groupOpen[key];
    const wrap = document.createElement('div');
    wrap.className = 'char-group';

    const head = document.createElement('button');
    head.className = 'char-group-head';
    head.addEventListener('click', () => {
      groupOpen[key] = !groupOpen[key];
      renderLibrary();
    });

    const title = document.createElement('span');
    title.className = 'char-group-title';
    title.textContent = label;

    const count = document.createElement('span');
    count.className = 'char-group-count';
    count.textContent = `（${cards.length} 个）`;

    const arrow = document.createElement('span');
    arrow.className = 'char-group-arrow';
    arrow.textContent = open ? '▾' : '▸';

    head.appendChild(title);
    head.appendChild(count);
    head.appendChild(arrow);
    wrap.appendChild(head);

    // 折叠时整段不渲染，这才是省性能的关键（而非 CSS 隐藏）
    if (open) {
      const list = document.createElement('ul');
      list.className = 'char-list';
      if (cards.length === 0) {
        const li = document.createElement('li');
        li.className = 'char-empty';
        li.textContent = '这里还没有字';
        list.appendChild(li);
      } else {
        cards.forEach(c => list.appendChild(charRow(c)));
      }
      wrap.appendChild(list);
    }
    return wrap;
  }

  function charRow(c) {
    const li = document.createElement('li');
    li.className = 'char-item';

    const charEl = document.createElement('span');
    charEl.className = 'char-item-char';
    charEl.textContent = c.char;

    const statusEl = document.createElement('span');
    statusEl.className = 'char-item-status';
    // 今日标记放最前面并上色，家长一眼看到哪个字可能点错了
    const tr = SRS.todayResult(c);
    if (tr) {
      const todayEl = document.createElement('span');
      todayEl.className = 'char-item-today is-' + tr;
      todayEl.textContent = '今日' + RESULT_LABELS[tr];
      statusEl.appendChild(todayEl);
    }
    const restEl = document.createElement('span');
    restEl.textContent = (tr ? ' · ' : '') + statusText(c);
    statusEl.appendChild(restEl);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-small btn-danger';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => deleteChar(c.id));

    li.appendChild(charEl);
    li.appendChild(statusEl);
    li.appendChild(delBtn);

    bindLongPress(li, () => openEditSheet(c));
    return li;
  }

  function statusText(c) {
    if (!c.learned) return '未学';
    if (SRS.isMastered(c)) return '已掌握';
    return `阶段 ${c.stage} · ${c.nextReview} 复习`;
  }

  /* ---------- 统计 ---------- */
  function renderStats() {
    const chars = data.characters;
    const total = chars.length;
    const learned = chars.filter(c => c.learned).length;
    const mastered = chars.filter(c => SRS.isMastered(c)).length;
    const due = SRS.buildQueue(chars, data.settings).reviewQueue.length;
    const today = SRS.todayStats(chars);
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-learned').textContent = learned;
    document.getElementById('stat-unlearned').textContent = total - learned;
    document.getElementById('stat-mastered').textContent = mastered;
    document.getElementById('stat-due').textContent = due;
    document.getElementById('stat-today-know').textContent = today.know;
    document.getElementById('stat-today-vague').textContent = today.vague;
    document.getElementById('stat-today-dontknow').textContent = today.dontknow;
  }

  /* ---------- 设置 ---------- */
  function bindSettings() {
    document.getElementById('save-settings-btn').addEventListener('click', async () => {
      const v = parseInt(document.getElementById('daily-new-input').value, 10);
      data.settings.dailyNewCount = Math.max(1, Math.min(100, v || 5));
      await save();
      showToast('设置已保存');
    });

    document.getElementById('reset-progress-btn').addEventListener('click', async () => {
      if (!confirm('确定重置所有学习进度吗？（汉字库会保留）')) return;
      data.characters.forEach(c => {
        c.learned = false; c.stage = 0; c.nextReview = null; c.learnedAt = null; c.history = [];
      });
      data.settings.previewConfirmedOn = null;
      await save();
      invalidateSession();
      showToast('进度已重置');
    });

    document.getElementById('clear-all-btn').addEventListener('click', async () => {
      if (!confirm('确定清空所有汉字和进度吗？此操作不可恢复。')) return;
      data.characters = [];
      data.settings.previewConfirmedOn = null;
      groupOpen = null;
      await save();
      invalidateSession();
      showToast('已清空');
    });
  }

  function renderSettings() {
    document.getElementById('daily-new-input').value = data.settings.dailyNewCount;
    // version.js 由 set-version.js 生成；缺失时不至于报错
    const v = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '未知';
    document.getElementById('app-version').textContent = v;
  }

  /* ---------- 工具 ---------- */
  function uid() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
