# Mimo Acceptance Checklist

This checklist is the release gate for the Mimo Docker deployment. Each item must be verified with evidence from the UI, API response, logs, database row, or local file path.

## Verification Commands

Run from the repository root:

```powershell
.\scripts\verify.ps1
```

Optional strict model-name validation:

```powershell
$env:MIMO_EXPECTED_MODELS = "mimo-v2.5-asr,mimo-v2.5-tts,mimo-v2.5-tts-voiceclone,mimo-v2.5-tts-voicedesign"
.\scripts\verify.ps1 -FailOnWarnings
```

HTTP smoke after the stack is running:

```powershell
$env:MIMO_BASE_URL = "http://localhost:18081"
node .\scripts\verify-http-smoke.mjs
```

## 1. Installation And Deployment

- [ ] The documented daily update path is `scripts/build-source-upload.ps1` plus the BaoTa upload flow.
- [ ] Docker is kept as a reference deployment and is not the default re-deploy path for normal source changes.
- [ ] `.env.example` documents app URL, session, SQLite, LinuxDo Connect, and Mimo API defaults for the retained Docker path.
- [ ] Laravel migrations run during setup or through a documented install step.
- [ ] Rebuilding containers does not delete generated or uploaded audio files.

## 2. Login And Session Control

- [ ] Users cannot access the product workspace without LinuxDo Connect login.
- [ ] Login starts from the local app and redirects to the configured LinuxDo authorization endpoint.
- [ ] OAuth callback validates state, exchanges the code server-side, and creates or updates the local user record.
- [ ] Logout clears the session and blocks protected API calls.
- [ ] Direct API requests without a valid session return `401` or `403`, never provider errors.

## 3. First Administrator Binding

- [ ] First launch opens an installation or setup flow before normal workspace access.
- [ ] The setup flow binds the first LinuxDo-authenticated user as administrator.
- [ ] After an administrator is bound, the setup route cannot bind another administrator.
- [ ] Non-admin users cannot open administrator settings or update global API configuration.
- [ ] The administrator binding is persisted in the configured database and survives container restarts.

## 4. API Configuration Priority

- [ ] Administrator can configure the default Mimo API endpoint, key, model choices, and operational limits.
- [ ] A user can save a personal API override when the product allows it.
- [ ] Request resolution order is user override first, then administrator default.
- [ ] Empty or disabled user overrides fall back to administrator defaults.
- [ ] API keys are never rendered back in full after saving and are not written to frontend bundles.
- [ ] Failed upstream requests show a local, professional error message without leaking secrets.

## 5. Audio Capabilities

- [ ] Speech-to-text accepts supported audio uploads and returns transcript text with clear job status.
- [ ] Text-to-speech accepts text and voice options, then stores the generated audio locally.
- [ ] Voice design accepts prompt or configuration input and returns a usable voice identifier or preview.
- [ ] Voice clone accepts required consent/sample inputs and creates a private cloned voice asset.
- [ ] Each capability records owner, status, provider request id when available, input metadata, output path, and error details.
- [ ] Capability endpoints validate file type, file size, text length, and required parameters before provider calls.

## 6. File Storage

- [ ] Uploaded samples are stored under the Laravel storage audio area or a mapped Docker volume.
- [ ] Generated audio files are stored in a separate generated-output path.
- [ ] Files are served through authenticated application routes, not public directory listing.
- [ ] Deleting a user asset removes or tombstones the database record and prevents further downloads.
- [ ] Container restart and rebuild preserve files in the configured Docker volume.

## 7. Permissions And Data Isolation

- [ ] Users can only see their own jobs, uploaded samples, generated audio, and cloned voices.
- [ ] Administrators can inspect operational records needed for support without exposing full API secrets.
- [ ] Cross-user access attempts return `403`.
- [ ] Rate limits or quotas prevent repeated unauthenticated or abusive generation requests.
- [ ] Audit-relevant actions are logged: login, admin binding, API config changes, generation requests, clone creation, and deletion.

## 8. Frontend Experience And Copy

- [ ] The first screen is the authenticated product workspace or setup flow, not a marketing landing page.
- [ ] UI uses professional product language for labels, statuses, empty states, and validation.
- [ ] Headings and helper text pass the configured professional copy scan in `scripts/verify.ps1`.
- [ ] ASR, TTS, voice design, and voice clone each have complete loading, success, error, and empty states.
- [ ] Forms expose practical controls: upload, model or voice selection, text input, consent where needed, submit, cancel, retry, and download.
- [ ] Mobile and desktop layouts keep controls readable without overlapping text.

## 9. Backend Contracts

- [ ] API route names are stable and documented for auth, installation status, admin config, user config, ASR, TTS, voice design, voice clone, files, and job status.
- [ ] Validation errors return structured JSON with field-level details.
- [ ] Provider errors are normalized into application errors with request ids when available.
- [ ] Jobs that require asynchronous processing expose status polling or event updates.
- [ ] Tests or smoke scripts can run without a real Mimo API key by asserting local validation and authentication behavior.

## 10. Release Evidence

- [ ] `.\scripts\verify.ps1` passes, or every failure is linked to an owner and tracked issue.
- [ ] `node .\scripts\verify-http-smoke.mjs` passes against the running stack.
- [ ] A manual run confirms install, LinuxDo login, admin binding, API priority, and all four audio workflows.
- [ ] Docker restart test confirms SQLite data and audio files persist in the Docker volume.
- [ ] Final screenshots or screen recordings cover setup, authenticated workspace, admin API config, and one completed audio result.
