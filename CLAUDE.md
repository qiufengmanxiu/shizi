# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

儿童识字 App：基于艾宾浩斯遗忘曲线的间隔重复（SRS）识字应用，目标用户是儿童。纯前端实现、完全离线运行。数据层双模式：浏览器用 `localStorage`，安卓原生（Capacitor）用 `@capacitor/preferences`（底层 SharedPreferences）。已具备 Capacitor 安卓打包能力（`build-apk.bat` 一键出 APK）。

## 运行方式

直接用浏览器打开 `index.html` 即可（无需联网、无需安装），也支持 `python -m http.server 8000`。

- `npm test` —— 冒烟测试（数据层 Web/原生双模式的 load/save、SRS 纯函数）
- `npm run sync` —— 把根目录 web 资源同步到 `www/`（Capacitor 的 webDir）
- `npm run version` —— 同步版本号（见下）
- `build-apk.bat` —— 一键打包安卓 APK（装依赖 → 同步版本与资源 → 生成工程 → 编译 → 输出到 `dist/`）

没有 lint；浏览器直开时仍是纯静态站点。

## 版本号（改动功能后必须做）

**唯一来源是 `package.json` 的 `version`**，改完跑 `node set-version.js`（`build-apk.bat` 已自动调用），它会同步到四处：

| 位置 | 内容 |
|---|---|
| `android/app/build.gradle` | `versionCode`（由版本号换算：`主*10000+次*100+修订`，必须递增）与 `versionName` |
| `capacitor.config.json` | `appName` = `儿童识字`（**不带版本号**） |
| `android/app/src/main/res/values/strings.xml` | `app_name` / `title_activity_main` = `儿童识字`（桌面图标名，**不带版本号**） |
| `js/version.js`（生成物，勿手改） | `APP_VERSION`，设置页显示用 |

**约定：每次改动功能都要升版本号，并体现在名字里。** 但**桌面图标名保持干净的「儿童识字」**（用户明确要求，为了以后上架），版本号体现在这三处：

1. 产物文件名 `dist/儿童识字-<版本>.apk`
2. 安卓 `versionName`（系统「应用信息」里可见，也决定能否覆盖安装升级）
3. App 内设置页的「版本」一栏

语义化版本：加功能升次版本（1.1.0 → 1.2.0），修 bug 升修订号。**已经产出过 APK 的版本号不要再复用**，内容变了就升号，否则同名文件分不清。

`set-version.js --apk` 在构建后把 APK 复制成 `dist/儿童识字-<版本>.apk`。

注意 `npx cap sync` **不会**覆盖 `strings.xml` 里的应用名（已验证），但 `set-version.js` 必须在 `cap sync` **之前**跑，否则 appName 进不了安卓侧。

## 架构

- `index.html` —— 单页应用外壳，四个视图（学习 / 汉字库 / 统计 / 设置）通过 `.view` 区块切换，底部 `.tab` 导航
- `css/style.css` —— 全部样式，移动端优先（`max-width: 480px`），儿童友好的大字号、大按钮
- `js/store.js` —— 数据持久化层，**异步**（`load`/`save` 均返回 Promise）。检测 `window.Capacitor.Plugins.Preferences`：原生环境走 `@capacitor/preferences`，否则回退 `localStorage`（键 `shizi_data_v1`）。加载时做字段兼容。
- `js/srs.js` —— 纯函数式复习算法，不接触 DOM，可独立测试
- `js/app.js` —— 主逻辑：视图切换、学习会话、汉字库增删、统计、设置

加载顺序：`version.js` → `store.js` → `srs.js` → `app.js`（`app.js` 在 `DOMContentLoaded` 时执行 `App.init()`）。全局对象为 `APP_VERSION`、`Store`、`SRS`、`App`（IIFE 模式，无模块系统）。

## 核心数据模型

所有状态存在一个对象里（`Store.load()` / `Store.save()`）：

- `characters[]` —— 汉字卡片，每张卡片字段：`id`、`char`、`learned`、`stage`（0..6）、`nextReview`（`YYYY-MM-DD` 或 `null`）、`addedAt`、`learnedAt`、`history[]`
- `settings.dailyNewCount` —— 每天新学字数（默认 5）
- `settings.previewConfirmedOn` —— 「今日任务预览页」已确认的日期（`YYYY-MM-DD` 或 `null`）。等于今天则当天不再弹预览；为 `null`/旧日期则重新弹。旧数据没有这个字段，靠 `Store` 的默认值合并得到 `null`，即视为未确认。

## 复习算法（srs.js）

阶段 → 复习间隔（天）：`INTERVALS = [1, 2, 4, 7, 15, 30]`，`MASTER_STAGE = 6`（等于 `INTERVALS.length`）表示已掌握。

按钮效果（`SRS.review(card, result)`）：
- `know`（认识）：阶段 +1，封顶到 `MASTER_STAGE`
- `vague`（模糊）：阶段不变
- `dontknow`（不认识）：阶段归 0

`review()` 会**原地修改**卡片并返回它：无论哪种结果都会把 `learned` 置为 `true`（含「不认识」，所以答过一次的字就不再算「未学」），`learnedAt` 只在首次学习时写入一次。`vague` 阶段虽不变，`nextReview` 仍会被重算为「今天 + `INTERVALS[stage]`」，相当于整段间隔从头再推。`history[]` 每次追加一条 `{ date, result }`。

`buildQueue(characters, settings)` 返回 `{ reviewQueue, newQueue, today }`：复习队列按 `nextReview` 升序；新学队列受 `dailyNewCount` 上限约束，用「`learnedAt === today` 的卡片数」计为今天已新学量。`app.js` 把两个队列拼成一个，按序出题。

`todayLearned(characters)` 返回 `{ know: ['一','二'], vague: [...], dontknow: [...] }`：把今天学过的字按结果分类。**同一个字今天若答过多次，按「当天最后一次」的结果归类，保证每个字只出现一次**（`history` 按时间追加，取最后一条）。只统计 `date === today` 的条目，所以读的是 `history` 而不是「当前这次会话」——**跨多次学习、跨 app 重启都算数**，是完整一天的数据。`history` 可能缺失，实现里用 `(c.history || [])` 兜底。

`todayStats(characters)` 返回 `{ know, vague, dontknow, total }`，由 `todayLearned` 派生（数量 = 各分组的字数），两者口径一致。课后总结页用前者列汉字，统计页用后者显示数字。

`todayResult(card)` 返回某个字今天的最后一次结果（无则 `null`），`todayLearned` 就是按它分组的。

`recompute(card)` 用整条 `history` 重放，算出 `stage` / `nextReview`。**`stage` 本身就是 `history` 的折叠结果**（`know` +1 封顶 6、`vague` 不变、`dontknow` 归 0），所以修正某次结果后重放即可得到正确阶段，**不需要额外记录「修改前的阶段」**。`learned` / `learnedAt` 只置位不清除（答过一次就不再算「未学」）。

`setTodayResult(card, result)` = 改写今天最后一条 `history` 的结果（今天没记录则补一条，等同今天补答一次）→ `recompute()`。这是「长按改今日标记」的实现。注意它**不只是改今日分类，还会连带修正复习阶段和下次复习时间**——孩子误点「不认识」会让阶段归零，改正后必须一起恢复。

## 启动流程（app.js）

`App.init()` 的顺序：`await Store.load()` → 绑定各视图事件 → `showView('learn')`（这一步会 `startSession()` 建好学习队列）→ 若 `settings.previewConfirmedOn !== SRS.todayStr()` 则调 `showTodayScreen()` 把 `#today-screen` 全屏遮罩盖在最上层。

遮罩是不透明的、`z-index: 200`、盖住底部导航，所以**未点「开始学习」就出不去**——这就是「不点确认就一直显示」的实现方式。点击确认会写入 `previewConfirmedOn = SRS.todayStr()` 并 `await save()`，此后当天不再弹。预览页里的汉字直接用 `SRS.buildQueue()` 取，与学习会话同源，保证两边数字一致。

注意闸门只在 `init()` 判断一次，切换 tab 不会重新弹出。

学习队列走完后（`renderLearn()` 的「队列走完」分支）调 `renderTodaySummary()`，把今天学过的字按 认识/模糊/不认识 **分组列出汉字**（不只给数字）。分组标题带数量，空分组不显示；今天一个字都没答过时整个总结块隐藏。渲染复用 `charGroupEl()`，与预览页同一套「标题 + 汉字小卡片」结构。

## 大字量下的布局（重要）

`reviewQueue` **没有上限**（只有 `newQueue` 受 `dailyNewCount` 限制，最大 100）。用户长时间没打开、或一次导入几百个字时，待复习量可能是几百。所以布局不能假设列表短：

- **今日预览页**：`.today-inner` 是满高的 flex 列，`#today-body`（汉字区）`flex: 1; overflow-y: auto`，标题和「开始学习」按钮**固定不动**。这样 500 个字时按钮依然点得到——早期版本用 `margin-top: auto` 把按钮顶到内容底部，字一多就必须滑几十屏才够得着。顶部还有 `#today-subtitle` 给一行 `复习 N · 新学 M` 总览，不滚动就知道规模。

## 汉字库页的规模处理（app.js）

汉字库按状态分三组渲染：`未学`（`!learned`）、`学习中`（`learned` 且未掌握）、`已掌握`（`SRS.isMastered`），分组逻辑在 `groupOf()`。每组标题可点击折叠，**折叠的分组完全不生成行**（不是 CSS 隐藏）——这是省性能的关键。实测 500 个字：折叠状态 18 个 DOM 节点，全展开才 2000+。

默认展开状态存在 `groupOpen`，首次渲染时按各分组数量决定：超过 `GROUP_AUTO_OPEN_MAX`（100）的默认折叠，`已掌握` 一律默认折叠。`groupOpen` 在会话内保持，用户手动折叠/展开后不会被后续 `renderLibrary()` 重置；「清空全部」会置回 `null` 以便重新计算。

## 长按改今日标记（app.js）

五行里长按某个字 500ms，弹出底部面板，可以把它**今天**的标记改成 认识/模糊/不认识，用来纠正孩子点错。要点：

- **手势**（`bindLongPress`）：用 Pointer Events。`pointerdown` 起计时，`pointermove` 位移超过 10px（用户在滚列表）或 `pointerup` 就取消；按下位置在删除按钮上则不触发。另外拦掉 `contextmenu`、并在 `.char-item` 上设 `user-select: none`，免得长按弹出系统的文字选择菜单。
- **刚弹出就被关掉**的坑：长按弹出面板后手指抬起，随之而来的那次 `click` 会落在遮罩上。`sheetOpenedAt` 记下弹出时刻，遮罩的 click 在 350ms 内一律忽略。
- 行首会显示 `今日认识/模糊/不认识`（`char-item-today`，带对应颜色），方便家长找到点错的那个字。
- 改正后要 `await save()` + `invalidateSession()`：阶段和下次复习时间都变了，当前学习队列会过期。

## 注意事项

- 首次运行（`localStorage` 为空或数据损坏）时，`Store.load()` 会用 `store.js` 的 `DEFAULT_CHARS` 预置 39 个常用字，所以全新浏览器打开也**不是空库**；「清空全部」才会得到空库。
- `Store` 对外只暴露 `{ load, save, KEY }`，两者均为**异步**（`await Store.load()` / `await Store.save(data)`）。`load()` 返回 `{ characters, settings }` 并把 `settings` 与默认值合并做字段兼容。
- `todayStr()` 在 `store.js` 和 `srs.js` 各有一份重复实现，但只有 `SRS.todayStr` 被导出、由 `app.js` 使用；改日期逻辑记得同步两处（或只认 `SRS` 那份）。
- 日期统一用 `YYYY-MM-DD` 字符串比较/排序（`srs.js` 的 `todayStr`/`addDays`），不要用 `Date` 对象直接比较。
- 修改数据后必须 `await save()`（异步），并调用 `app.js` 的 `invalidateSession()` 使当前学习会话失效，否则学习页会显示过期队列。
- 后续加图片/文件时，`localStorage`（约 5MB）不够，需迁到 IndexedDB（存 Blob）或 Capacitor Filesystem。
- Capacitor 的 WebView 里 `localStorage`、`confirm()`、`alert()` 均可用，无需特殊适配。
- **`npx cap sync` 会把 `android/capacitor-cordova-android-plugins/` 整个删掉、从 `node_modules/@capacitor/cli/assets/capacitor-cordova-android-plugins.tar.gz` 重新解压**（见 `cli/dist/android/update.js` 的 `removePluginsNativeFiles`），所以手改这个目录里的文件是白费。它模板里的 `sourceCompatibility` 是 21，但该模块没有任何 Java/Kotlin 源码（Gradle 报 `NO-SOURCE`），这个值不参与编译，不影响本机 JDK 17 构建。
- 真正决定 Java 版本的是另外几处（见 [[capacitor8-jdk17-workaround]] 的做法）：`node_modules/@capacitor/android/capacitor/build.gradle`、`node_modules/@capacitor/preferences/android/build.gradle`（属于已安装的包，`cap sync` 不会动），以及 `android/app/capacitor.build.gradle`（由 `cli/dist/android/update.js` 的模板生成，已把模板改成 17，所以同步后仍是 17）。
