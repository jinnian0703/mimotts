# MimoTTS Backend

Laravel API backend for LinuxDo Connect authentication, installation binding, Mimo API configuration, and audio task processing.

## Setup

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
composer test
```

Required OAuth values:

- `LINUXDO_CLIENT_ID`
- `LINUXDO_CLIENT_SECRET`
- `LINUXDO_REDIRECT_URI`

Mimo defaults:

- Base URL: `https://api.xiaomimimo.com/v1`
- Endpoint: `/chat/completions`
- Header: `api-key`

## API Entry Points

- `GET /api/install/status`
- `POST /api/install`
- `GET /api/auth/linuxdo/redirect`
- `GET /api/auth/linuxdo/callback`
- `GET /api/me`
- `POST /api/auth/logout`
- `GET|PUT /api/admin/mimo-config`
- `GET|PUT|DELETE /api/user/api-config`
- `POST /api/mimo/asr`
- `POST /api/mimo/tts`
- `POST /api/mimo/voice-design`
- `POST /api/mimo/voice-clone`
- `GET /api/mimo/jobs/{audioJob}`
- `GET /api/mimo/files/{audioFile}`
