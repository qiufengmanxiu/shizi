/* 儿童识字 App —— 本地存储层
 * Web 环境：localStorage；安卓原生（Capacitor）：@capacitor/preferences（原生 SharedPreferences）
 * load()/save() 均为异步，原生分支走 Preferences.get/set，Web 分支走 localStorage。 */
const Store = (() => {
  const KEY = 'shizi_data_v1';

  // 预置的初始汉字库（首次使用自动加载，可自行增删）
  const DEFAULT_CHARS = '一二三四五六七八九十人口手大小上下日月水火山石田土木花草云风雨爸妈爷奶哥姐弟妹';

  // previewConfirmedOn：今日任务预览页的「已确认」日期（YYYY-MM-DD）。
  // 等于今天则当天不再弹预览；为 null / 旧日期则重新弹。
  const defaultSettings = { dailyNewCount: 5, previewConfirmedOn: null };

  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function buildDefaultCharacters() {
    const today = todayStr();
    return Array.from(DEFAULT_CHARS).map((ch, i) => ({
      id: 'd' + i,
      char: ch,
      learned: false,
      stage: 0,
      nextReview: null,
      addedAt: today,
      learnedAt: null,
      history: [],
    }));
  }

  function defaults() {
    return { characters: buildDefaultCharacters(), settings: Object.assign({}, defaultSettings) };
  }

  // 解析已存储的 JSON，做字段兼容
  function parse(raw) {
    const parsed = JSON.parse(raw);
    return {
      characters: Array.isArray(parsed.characters) ? parsed.characters : [],
      settings: Object.assign({}, defaultSettings, parsed.settings || {}),
    };
  }

  // 是否运行在 Capacitor 原生环境（原生 WebView 会注入 window.Capacitor）
  function isNative() {
    return !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences);
  }

  async function load() {
    if (isNative()) {
      const { value } = await window.Capacitor.Plugins.Preferences.get({ key: KEY });
      if (value) return parse(value);
      // 原生首次使用：写入预置默认汉字库
      const data = defaults();
      await window.Capacitor.Plugins.Preferences.set({ key: KEY, value: JSON.stringify(data) });
      return data;
    }

    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return parse(raw);
    } catch (e) {
      console.warn('读取本地数据失败，使用默认数据', e);
    }
    // 首次使用：预置默认汉字库
    return defaults();
  }

  async function save(data) {
    const raw = JSON.stringify(data);
    if (isNative()) {
      await window.Capacitor.Plugins.Preferences.set({ key: KEY, value: raw });
    } else {
      localStorage.setItem(KEY, raw);
    }
  }

  return { load, save, KEY };
})();
