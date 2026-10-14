// 把根目录的 web 源码同步到 www/（Capacitor 的 webDir）
// 用法：node copy-web.js
const fs = require('fs');
const path = require('path');

const root = __dirname;
const www = path.join(root, 'www');
const entries = ['index.html', 'css', 'js'];

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
for (const e of entries) {
  fs.cpSync(path.join(root, e), path.join(www, e), { recursive: true });
}
console.log('web 资源已同步到 www/');
