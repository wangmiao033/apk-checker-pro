# apk-checker-api

Standalone APK static analysis backend for APKFlow.

## API

- `POST /api/analyze`
- `GET /api/health`
- `GET /health`

`POST /api/analyze` accepts `multipart/form-data`:

- `file`: `.apk`, required, max 2048MB
- `channels`: optional JSON string array

## Runtime Requirements

This service runs APK static checks only. It does not install APKs, start games, run emulators, or execute APK code.

The host must provide these commands in `PATH`:

- `unzip`
- `aapt`
- `apksigner`
- `strings`

The service calls commands with argument arrays through `execFileSync` and does not invoke a shell.

## Local Run

```bash
npm install
npm start
```

```bash
curl http://localhost:8080/api/health
```

## Docker

```bash
docker build -t apk-checker-api .
docker run --rm -p 8080:8080 \
  -e CORS_ORIGIN=https://apk.hnchpower.cn \
  apk-checker-api
```

## Production

Deploy this API to a VM, container host, or other server that supports:

- 2048MB uploads
- local temporary files
- system commands
- Android build tools

Example frontend env:

```text
NEXT_PUBLIC_ANALYZE_API_URL=https://apk-api.hnchpower.cn/api/analyze
```
