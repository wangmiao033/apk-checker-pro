# 部署说明

## 推荐环境

- Ubuntu 22.04+
- Node.js 18+
- Android SDK Build Tools
- Nginx
- PM2

## 安装 Node.js

```bash
node -v
npm -v
```

## 安装依赖

```bash
npm install
npm run build
```

## 启动

```bash
npm run start
```

或使用 PM2：

```bash
pm2 start npm --name apkflow -- start
```

## Nginx 示例

```nginx
server {
    listen 80;
    server_name apk-checker.yourdomain.com;

    client_max_body_size 2048m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Android SDK Build Tools

需要确保以下命令在 PATH 中可用：

```bash
aapt
apksigner
unzip
strings
```
