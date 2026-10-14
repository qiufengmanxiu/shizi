# 儿童识字 App

基于艾宾浩斯遗忘曲线的本地儿童识字应用。纯前端实现，离线运行，可打包成安卓 APK（Capacitor）。

## 功能

- 手动添加汉字库（支持一次粘贴多个字，自动去重、自动过滤非汉字）
- 每天按遗忘曲线自动安排「复习旧字 + 学习新字」
- 三个按钮：认识 / 模糊 / 不认识，分别决定下次复习时间
- 每日新字数量可设置（默认 5）
- 统计面板：总数 / 已学 / 未学 / 已掌握 / 今日待复习

## 运行（浏览器）

直接用浏览器打开 `index.html` 即可（无需联网、无需安装任何依赖）。

也可以在项目目录下启动本地静态服务器：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 数据存储

数据层同时支持两种后端，运行时自动切换：

- **浏览器环境**：`localStorage`（键 `shizi_data_v1`）
- **安卓原生环境（Capacitor）**：`@capacitor/preferences`（底层是原生 SharedPreferences，比 WebView 的 localStorage 更可靠，不会被系统轻易清除）

首次运行会预置 39 个常用字。

## 复习算法

| 按钮 | 效果 |
|---|---|
| 认识 | 阶段 +1，复习间隔变长 |
| 模糊 | 阶段不变，按原间隔复习 |
| 不认识 | 阶段归零，从头复习 |

复习间隔（天）：1 → 2 → 4 → 7 → 15 → 30 →（已掌握）

## 打包安卓 APK

### 环境要求

- Node.js
- Android Studio（含 Android SDK）
- JDK 17（Android Studio 自带的 jbr 即可，`build-apk.bat` 已自动指向它）

### 一键打包

双击或在终端运行：

```bash
build-apk.bat
```

脚本会自动完成：装依赖 → 同步版本号 → 同步 web 资源 → 生成安卓工程 → 编译 APK → 输出到 `dist/`。

产物：`dist/儿童识字-<版本号>.apk`（原始文件在 `android/app/build/outputs/apk/debug/app-debug.apk`）。

> 注意：`build-apk.bat` 里的 `JAVA_HOME`（jbr 路径）和 `ANDROID_HOME`（SDK 路径）默认是标准安装位置，换机器需按实际路径修改。
>
> 首次编译会联网下载 Gradle 和安卓依赖，耗时较长；若下载慢/失败，可给 Gradle 配置阿里云镜像（见下）。

### 版本号

版本号唯一来源是 `package.json` 的 `version`。**每次改动功能都要升版本号**，然后：

```bash
node set-version.js
```

它会同步到安卓的 `versionCode`/`versionName` 和设置页的版本显示。`build-apk.bat` 已自动调用，手动打包时记得跑一下。

版本号体现在**产物文件名**（`dist/儿童识字-1.1.1.apk`）、**安卓 versionName** 和 **App 内设置页**。桌面图标名始终是干净的「儿童识字」，不带版本号。

规则：加功能升次版本号（1.1.0 → 1.2.0），修 bug 升修订号；已经出过包的版本号不要复用。

### 手动分步（等价于脚本做的事）

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/preferences
node copy-web.js                 # 同步 web 资源到 www/
npx cap add android              # 首次生成 android/ 工程
npx cap sync android             # 之后每次改代码后重新同步
cd android && gradlew.bat assembleDebug
```

### Gradle 镜像（国内加速，可选）

在 `android/settings.gradle` 的仓库列表里，把 google / mavenCentral 前置阿里云镜像：

```
maven { url 'https://maven.aliyun.com/repository/google' }
maven { url 'https://maven.aliyun.com/repository/central' }
maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
```

### 测试

```bash
npm test        # 冒烟测试：验证数据层 Web / 原生 双模式的 load/save
```
