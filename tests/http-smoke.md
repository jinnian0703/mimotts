# HTTP Smoke Test Contract

Use `scripts/verify-http-smoke.mjs` after the Docker stack or local dev servers are running.

Required command:

```powershell
$env:MIMO_BASE_URL = "http://localhost:8080"
node .\scripts\verify-http-smoke.mjs
```

Strict CI command:

```powershell
$env:MIMO_BASE_URL = "http://localhost:8080"
$env:MIMO_SMOKE_STRICT = "1"
node .\scripts\verify-http-smoke.mjs
```

The smoke script intentionally sends no real Mimo API key. Protected ASR, TTS, voice design, and voice clone endpoints must reject the request locally with `400`, `401`, `403`, or `422`; they must not return `5xx` or call the upstream provider.
