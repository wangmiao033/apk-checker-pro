# APKFlow - APK Channel Precheck Platform

APKFlow is a frontend PWA plus standalone APK static analysis backend.

The Vercel deployment is now frontend-only:

```text
https://apk.hnchpower.cn/
```

Large APK analysis must be handled by the standalone backend in:

```text
apk-checker-api/
```

Do not use Vercel API Routes for large APK uploads in production. Vercel should host the UI and PWA assets only.

## Repository Layout

```text
app/                 Next.js frontend
components/          Frontend UI components
lib/                 Frontend shared types/rules
public/              PWA assets
apk-checker-api/     Standalone Express analysis backend
package.json         Frontend package
DEPLOY.md            Frontend deployment notes
```

## Frontend

The frontend is built with:

- Next.js
- TypeScript
- Tailwind CSS
- PWA assets under `public/`

### Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

### Build

```bash
npm run build
npm run start
```

### Analyze API URL

The upload component reads:

```text
NEXT_PUBLIC_ANALYZE_API_URL
```

If the variable is not configured, the frontend falls back to:

```text
/api/analyze
```

Production should configure:

```text
NEXT_PUBLIC_ANALYZE_API_URL=https://apk-api.hnchpower.cn/api/analyze
```

## Backend

The standalone backend is located in:

```text
apk-checker-api/
```

It provides:

- `POST /api/analyze`
- `GET /api/health`
- `GET /health`
- `GET /api/version`
- `GET /api/test-releases`
- `POST /api/test-releases`
- `GET /api/test-releases/:id`
- `POST /api/test-releases/:id`
- `POST /api/test-releases/:id/archive`
- `POST /api/test-releases/:id/restore`
- `GET /api/test-releases/:id/download`
- `POST /api/test-submissions`

Runtime behavior:

- Node.js Express server
- `multer` receives APK uploads
- max upload size: 2048MB
- uploads are detected by file content, not only by filename suffix
- abnormal names such as `.apk.1`, `.apk.txt`, `.apk(1)`, `.apk_1`, and no-suffix APK files are automatically normalized on the server
- APK is saved to a temporary directory
- static commands are called: `unzip`, `aapt`, `apksigner`, `strings`
- JSON report is returned
- temporary APK is deleted after analysis
- APK code is not executed
- APK is not installed
- no emulator or device is used
- parse failures return `parse_error`, not `failed`
- parse failures show "评分不可用" and do not generate channel failure conclusions
- health responses include the current engine mode, tool availability, upload limit, and backend version
- hard checks return Chinese explanations, risk levels, current values, expected values, and remediation suggestions
- test release records are persisted as JSON and can be configured with `APK_DATA_DIR` or `TEST_RELEASE_STORE_FILE`
- test release download counts only cover clicks through `/api/test-releases/:id/download`

Hard checks:

- `targetSdkVersion`: `< 30` is `blocker`; `>= 30` passes; unparsed values are `unknown`
- `ABI compatibility`: missing `arm64-v8a` is `blocker`; pure 32-bit packages are `blocker`; only 64-bit packages are `warning`; `armeabi-v7a + arm64-v8a` passes

Privacy risk checks:

- high-risk permissions are reported as privacy warnings, not direct violations
- suspected privacy dialog resources are reported as static evidence only; they do not prove compliance
- pre-consent collection keywords are reported as high risk and require real-device validation before release
- Unity games should complete privacy authorization before starting `UnityPlayerActivity`

Security boundary:

- only files whose content is detected as APK are accepted
- uploaded filenames are sanitized and never trusted as paths
- APK identity is confirmed by ZIP magic and APK directory evidence such as `AndroidManifest.xml`
- command execution uses argument arrays, not shell string concatenation
- temporary files are cleaned in `finally`
- CORS allows `https://apk.hnchpower.cn` by default

### Backend Local Run

```bash
cd apk-checker-api
npm install
npm start
```

Health check:

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/version
```

### Backend Dependencies

The backend server must have these commands available in `PATH`:

```text
unzip
aapt
apksigner
strings
```

`aapt` and `apksigner` come from Android SDK Build Tools or Linux packages.

### Docker

```bash
cd apk-checker-api
docker build -t apk-checker-api .
docker run --rm -p 8080:8080 \
  -e CORS_ORIGIN=https://apk.hnchpower.cn \
  apk-checker-api
```

## Production Deployment

Recommended architecture:

```text
Browser
  -> Vercel frontend: https://apk.hnchpower.cn
  -> Analysis API: https://apk-api.hnchpower.cn/api/analyze
```

Deploy the backend to a VM, cloud server, container service, or Kubernetes cluster that supports:

- 2048MB request bodies
- local temporary file writes
- system command execution
- Android build tools

If Nginx or another gateway is in front of the API, configure upload size:

```nginx
client_max_body_size 2048m;
```

Then set the Vercel frontend environment variable:

```text
NEXT_PUBLIC_ANALYZE_API_URL=https://apk-api.hnchpower.cn/api/analyze
```

Redeploy the Vercel frontend after changing the environment variable.
