# Bharat Voice Backend

Bharat Voice is a production-oriented AI-powered government citizen assistance platform for India. This repository currently implements **Phase 1** of the backend roadmap: the enterprise backend foundation, secure runtime configuration, observability baseline, Twilio ingress, Railway deployment metadata, and CI validation.

## Phase 1 scope

- Production-grade Node.js + TypeScript backend bootstrap
- Clean module boundaries for future Supabase, Prisma, Gemini, Sarvam, and mobile-admin integrations
- Secure Express application lifecycle with structured logging and centralized error handling
- Twilio incoming call webhook handling and Twilio Media Stream websocket ingress boundary
- Health checks, rate limiting, and configuration validation
- Railway deployment configuration
- GitHub Actions CI for typecheck, lint, and tests

## Architecture overview

```text
Twilio Voice Webhook -> Express Voice Routes -> Voice Service -> TwiML Response
Twilio Media Stream   -> WebSocket Gateway    -> Session Event Validation -> Structured Logging
Mobile Admin App      -> Future REST APIs     -> Future Auth/Knowledge Modules
```

## Repository structure

```text
src/
  app/                 Express composition root
  config/              Environment loading and logger construction
  modules/
    health/            Liveness and readiness endpoints
    voice/             Twilio voice webhooks and media stream ingress
  shared/
    errors/            Shared domain-safe application errors
    http/              HTTP middleware and error lifecycle
  test/                Shared test helpers
```

## Installation

```bash
npm install
cp .env.example .env
```

## Local development

```bash
npm run dev
```

The service starts on `PORT` and exposes:

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- `POST /api/v1/voice/twilio/incoming`
- `POST /api/v1/voice/twilio/status`
- `WS /api/v1/voice/media-stream`

## Environment variables

See [.env.example](./.env.example). The most important variables for Phase 1 are:

- `PUBLIC_BASE_URL`: public base URL used to derive callbacks and stream URLs
- `TWILIO_AUTH_TOKEN`: required when Twilio signature validation is enabled
- `TWILIO_SIGNATURE_VALIDATION_ENABLED`: keeps webhook verification on in secure environments
- `TWILIO_MEDIA_STREAM_ENABLED`: enables `<Connect><Stream>` responses for live call streaming
- `TWILIO_MEDIA_STREAM_SECRET`: shared secret enforced on the websocket media ingress path

## Validation commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Twilio local testing

For local webhook testing, use a public tunnel and point Twilio voice webhooks to:

`POST {PUBLIC_BASE_URL}/api/v1/voice/twilio/incoming`

When `TWILIO_MEDIA_STREAM_ENABLED=true`, the backend will instruct Twilio to connect the call audio stream to:

`WS {PUBLIC_BASE_URL}/api/v1/voice/media-stream`

with an enforced `token` query parameter derived from `TWILIO_MEDIA_STREAM_SECRET`.
