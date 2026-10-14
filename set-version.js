// 版本号同步脚本。唯一来源是 package.json 的 version，改完版本号跑一下即可。
//
//   node set-version.js         同步到 android/build.gradle、capacitor.config.json、
//                               strings.xml、js/version.js
//   node set-version.js --apk   构建完成后，把产物复制成带版本号的文件名到 dist/
//
// 版本号体现在：APK 文件名（dist/儿童识字-1.1.1.apk）、安卓 versionCode/versionName、
// 设置页显示。桌面图标名不带版本号，始终是「儿童识字」。
const fs = require('fs');
const path = require('path');

const root = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const APP_BASE = '儿童识字'; // 桌面图标名，保持干净不带版本号
const appName = APP_BASE;

// 1.1.0 -> 10100。versionCode 是整数且必须随版本递增，所以按 主*10000+次*100+修订 映射。
function toCode(v) {
  const [a = 0, b = 0, c = 0] = String(v).split('.').map(n => parseInt(n, 10) || 0);
  return a * 10000 + b * 100 + c;
}

function writeFile(rel, content) {
  const p = path.join(root, rel);
  fs.writeFileSync(p, content);
  console.log(`  写入 ${rel}`);
}

if (process.argv.includes('--apk')) {
  const src = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (!fs.existsSync(src)) {
    console.error(`找不到 APK：${src}\n请先完成构建。`);
    process.exit(1);
  }
  const outDir = path.join(root, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${APP_BASE}-${version}.apk`);
  fs.copyFileSync(src, out);
  console.log(`APK 已输出：dist/${APP_BASE}-${version}.apk`);
  return;
}

console.log(`同步版本号 ${version}（versionCode ${toCode(version)}）`);

// build.gradle：versionCode / versionName
const gradleRel = 'android/app/build.gradle';
const gradlePath = path.join(root, gradleRel);
if (fs.existsSync(gradlePath)) {
  let g = fs.readFileSync(gradlePath, 'utf8');
  const before = g;
  g = g.replace(/versionCode\s+\d+/, `versionCode ${toCode(version)}`);
  g = g.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
  if (g === before) {
    console.warn(`  ⚠ ${gradleRel} 没找到 versionCode/versionName，请检查`);
  } else {
    fs.writeFileSync(gradlePath, g);
    console.log(`  写入 ${gradleRel}`);
  }
}

// capacitor.config.json：appName（cap sync 会据此更新安卓侧的名称）
const cfgRel = 'capacitor.config.json';
const cfg = JSON.parse(fs.readFileSync(path.join(root, cfgRel), 'utf8'));
cfg.appName = appName;
writeFile(cfgRel, JSON.stringify(cfg, null, 2) + '\n');

// strings.xml：桌面图标名（不带版本号）。cap sync 未必会改它，这里直接写死名字
const stringsRel = 'android/app/src/main/res/values/strings.xml';
const stringsPath = path.join(root, stringsRel);
if (fs.existsSync(stringsPath)) {
  let s = fs.readFileSync(stringsPath, 'utf8');
  s = s.replace(/(<string name="app_name">)[^<]*(<\/string>)/, `$1${appName}$2`);
  s = s.replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, `$1${appName}$2`);
  writeFile(stringsRel, s);
}

// js/version.js：给网页层读，设置页显示、也便于确认手机上装的是哪个版本
writeFile('js/version.js',
  `/* 由 set-version.js 生成，请勿手改；版本号唯一来源是 package.json */\n` +
  `const APP_NAME = '${APP_BASE}';\n` +
  `const APP_VERSION = '${version}';\n`);
