# apk-checker-api

Standalone APK static analysis backend for APKFlow.

## API

- `POST /api/analyze`
- `GET /api/health`
- `GET /health`
- `POST /api/test-release-files`
- `GET /api/test-release-files/:fileId/:fileName`
- `GET /api/test-releases`
- `POST /api/test-releases`
- `GET /api/test-releases/:id`
- `POST /api/test-releases/:id`
- `POST /api/test-releases/:id/archive`
- `POST /api/test-releases/:id/restore`
- `GET /api/test-releases/:id/download`
- `POST /api/test-submissions`

`POST /api/analyze` accepts `multipart/form-data`:

- `file`: APK content, required, max 2048MB. Filename may be `.apk`, `.apk.1`, `.apk.txt`, or no suffix.
- `channels`: optional JSON string array

Test release records are stored as JSON. Configure storage with:

- `APK_DATA_DIR`: directory for backend runtime data
- `TEST_RELEASE_STORE_FILE`: exact JSON file path
- `TEST_RELEASE_FILE_DIR`: exact directory for uploaded test release APK files

`POST /api/test-release-files` accepts `multipart/form-data`:

- `file`: APK content, required, max `MAX_UPLOAD_MB`
- Returns `apkUrl` and `apkSize`; use `apkUrl` as the release download source.

Download counts are incremented only when users visit `/api/test-releases/:id/download`; direct third-party APK URLs cannot be counted by APKFlow.

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
- content-based APK detection using ZIP magic and `AndroidManifest.xml`
- automatic server-side filename normalization for abnormal APK suffixes
- local temporary files
- system commands
- Android build tools

Example frontend env:

```text
NEXT_PUBLIC_ANALYZE_API_URL=https://apk-api.hnchpower.cn/api/analyze
```
