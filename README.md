# APKFlow - 高级 UI SaaS 版 APK 渠道提交前检测平台

这是一个「Web 平台 + PWA」版本的 APK 渠道提交前检测工具。目标是让运营、测试、产品和研发在提交各安卓渠道前，先上传 APK 做静态机审检测，避免因为 64 位、targetSdkVersion、权限、HTTP、Debug、签名等问题被渠道驳回。

## 功能

- 高级 SaaS 风格 UI
- 左侧导航：检测工作台 / 历史记录 / 渠道规则 / 报告中心 / 系统设置
- 上传 APK
- 拖拽上传
- 检测是否包含 `lib/arm64-v8a/`
- 检测是否为纯 32 位包
- 检测 `targetSdkVersion >= 30`
- 检测敏感权限
- 检测 HTTP 明文地址
- 检测 Debug / 测试配置
- 检测签名信息
- 多渠道规则评分
- APKFlow 总评分
- 风险雷达
- 自动生成研发整改说明
- 自动生成运营话术
- 下载 JSON 报告
- 下载 HTML 渠道提交前报告
- 浏览器本地检测历史
- PWA 支持，可添加到手机桌面

## 启动

```bash
npm install
npm run dev
```

访问：

```text
http://localhost:3000
```

## 生产构建

```bash
npm run build
npm run start
```

## 服务器依赖

服务器需要安装：

```bash
unzip
strings
aapt
apksigner
```

`aapt` 和 `apksigner` 来自 Android SDK Build Tools。

Linux 示例：

```bash
sudo apt update
sudo apt install unzip binutils
```

Android Build Tools 需要通过 Android SDK 安装，并把 build-tools 目录加入 PATH。

## 渠道规则配置

渠道规则在：

```text
lib/channelRules.ts
```

默认包含：

- 通用渠道
- 小米
- 华为
- OPPO
- vivo
- 荣耀
- TapTap
- 应用宝
- B站

默认基础规则：

```text
必须包含 arm64-v8a
targetSdkVersion >= 30
不允许纯 32 位包
```

## PWA

项目已包含：

```text
public/manifest.webmanifest
public/sw.js
```

部署到 HTTPS 域名后，可以在手机浏览器选择「添加到主屏幕」，形成类似 App 的工具体验。

## 安全边界

第一阶段只做静态分析：

- 不安装 APK
- 不启动 APK
- 不执行 APK 内代码
- 不跑模拟器
- 不连真机
- APK 临时保存，检测完成后删除

## 部署建议

推荐部署到公司云服务器：

```text
apk-checker.yourdomain.com
```

不建议优先部署到纯 Serverless，因为需要调用本地系统命令：`aapt`、`apksigner`、`unzip`、`strings`。

Nginx 需要配置上传大小，例如：

```nginx
client_max_body_size 300m;
```

## 后续升级方向

- 用户登录
- 团队权限
- 云端历史记录
- 数据库保存报告
- PDF 报告
- 飞书 / 企业微信通知
- CI/CD 接入
- 自动出渠道提交前邮件
- 动态安装测试
- 白屏 / 闪退 / ANR 检测
