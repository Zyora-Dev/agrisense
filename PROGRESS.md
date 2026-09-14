# AgriSense Progress

## Android Screen Suite - 0.2.0

- Diagnostic run `34823052183`: guest notebook state was loading=false,
  error=null, and the screenshot showed the Soil test button. Its merged
  semantics node had OnClick but no Text, explaining the text-selector timeout.
  Added an explicit Add soil test accessibility description and selected it in
  the test. Save/reopen-zero and no-cloud-request checks remain required; fixed
  emulator validation is pending. This was not evidence of a SQLite failure.
- Run `34820084157` confirmed compilation, eight JVM tests, lint, APK and
  authenticated screen tour pass. All 20 screenshots were retained successfully.
  Guest entry and notebook heading assertions passed; Soil test still timed out.
  Corrected the diagnostic catch to ComposeTimeoutException and included the
  guest ViewModel state, since AssertionError did not catch this timeout.
- Correction commit `6947b8a`, run `34818942524`: app and instrumentation
  compilation, eight JVM tests, lint and APK assembly passed. Authenticated
  20-screen emulator tour passed. Offline notebook test timed out waiting for
  the Soil test button, before entering data; investigation remains active.
  Test screenshots now use shared MediaStore storage to survive app uninstall;
  notebook checks distinguish entry, persisted zero and lazy-list visibility.
- Run `34817555583` failed Kotlin compilation before tests/APK generation:
  OkHttp's Kotlin Dns interface cannot accept a lambda, and product soil-list
  saved state needed an explicit List<String> type. Both have been corrected;
  replacement cloud compilation passed. Editor diagnostics alone do not
  validate Kotlin builds. The workflow now compiles instrumentation tests before
  emulator startup and preserves screenshots when instrumented tests fail.
- Implemented Kotlin/Compose login, registration, configurable API connection,
  dashboard, farm CRUD, device registration and one-time key display, readings
  with charts/date filters/manual entry, weather, analysis and farm advice/chat.
- Added marketplace search/category filters, explicit non-purchasable demo
  listings, farm-report matches, vendor detail, COD checkout, buyer/seller order
  filters/actions, vendor onboarding and product editing.
- Added profile, password change, session revocation, account audit filters,
  logout and local account removal. Shared light theme, five-tab navigation,
  bottom-sheet forms, loading/error/empty states and readable source labels.
- Android Keystore encrypts session and account-scoped cloud cache. Offline
  cached data is labeled; the SQLite notebook remains phone-wide/local-only.
  Cloud writes require internet; no automatic reading upload/retry is enabled.
- Added endpoint/date/JSON JVM checks and isolated Compose screen-tour/notebook
  tests with hosted-emulator screenshots. Kotlin compilation, eight JVM tests,
  lint and the screen tour pass; the offline notebook check remains unresolved.
- User approved commit/push for GitHub validation. No Android SDK or emulator
  installed on the Mac. Native photo inference, real IoT pairing/communication,
  durable synchronization and physical-phone testing remain unfinished.

## Android Compatibility Fix

- First CI run `34814206731` passed all five JVM tests but failed lint on two
  API-level mismatches: `clearCapabilities()` needs API 30 and the theme's light
  navigation-bar attribute needs API 27, while the app supports API 26.
- Commit `9dc3766` removes both unsupported uses without raising minSdk. The
  default network request does not require INTERNET, preserving observation of
  ordinary local Wi-Fi networks without validated internet. Physical IoT network
  behavior still needs device testing.
- Theme XML and patch whitespace checks pass locally. Replacement CI run:
  https://github.com/Zyora-Dev/agrisense/actions/runs/34815346535
  Completed successfully: five tests passed, none failed/skipped; lint has zero
  errors and seven non-blocking warnings (target/dependency updates and Android
  12 backup rules). Debug APK assembly and artifact uploads succeeded.
- APK artifact `agrisense-debug-3` (16,540,957 bytes compressed):
  https://github.com/Zyora-Dev/agrisense/actions/runs/34815346535/artifacts/10335714929
  Reports are in `android-reports-3`. No SDK or APK download was needed locally.
  Phone installation, persistence, UI and actual IoT operation remain unverified.

## GitHub Repository Setup

- User selected `https://github.com/Zyora-Dev/agrisense.git`; verified accessible
  and empty, then initialized this workspace on `main` with that origin.
- Staged 131 source/configuration files (about 1 MiB). Ignore checks exclude
  environment secrets, databases, dependencies, datasets, model artifacts,
  training runs and local editor settings. A recognized-credential-pattern scan
  found no matches in staged content; this is not a comprehensive security audit.
- Initial commit `5681a81` pushed successfully to `origin/main`. Android Debug APK
  run `34814206731` failed lint:
  https://github.com/Zyora-Dev/agrisense/actions/runs/34814206731
  The compatibility fix and successful replacement run are recorded above.

## Android Foundation - GitHub Build Prepared

- Confirmed Kotlin + Jetpack Compose and the existing `mobile/` directory.
  Work stays in this workspace; no new editor window or local SDK installation.
- Required behavior: offline operation over IoT local Wi-Fi without internet,
  persistent local readings and later backend synchronization. Wi-Fi presence
  and internet availability must remain distinct; Wi-Fi is not proof of pairing.
- Added an Android API 26+ app with a local manual pH/NPK notebook, app-private
  SQLite storage, separate network indicators and an Android Wi-Fi settings link.
  Notebook field labels are not backend farm IDs; records remain local-only.
- Added five JVM tests for validation, zero/decimal handling and independent
  Wi-Fi/internet states. Added `.github/workflows/android.yml` to run unit tests,
  Android lint and debug APK assembly on hosted Ubuntu, then upload APK/reports.
- Pinned AGP 8.9.2, Kotlin 2.1.20, Gradle 8.11.1, JDK 17 and SDK 35 for CI.
  Local Homebrew JDK 21.0.9 works; missing macOS Java registration caused the
  earlier false impression that no JDK was installed. Local disk has only 1.8 GiB
  free, so builds are intended for GitHub, without Android Studio or an emulator.
- Workflow YAML/build-path assertions and Android XML validation pass locally.
  The first CI run passed five Kotlin unit tests; lint and APK build status are
  tracked above. Persistence and phone UI behavior still need device testing.
- Authentication, account-scoped caching, duplicate-safe upload/outbox, firmware
  protocol/pairing, actual IoT reads and native model inference remain pending.
  Current backend reading POSTs lack idempotency, so no automatic retry/upload
  has been enabled. No hardware validation is claimed.
- Debug signing is temporary; successive runner keys may differ. Stable signing
  is needed before storing important phone records or relying on APK upgrades.

## Login Lifetime - 15 Days

- Set the default and maximum login lifetime to 21600 minutes (15 days).
  JWT expiry, stored account-session expiry and the existing HTTP-only cookie
  share this lifetime. Effective local configuration verified as 15 days.
- Applies to new sign-ins; existing tokens keep their original expiry. This is
  a fixed duration, not sliding renewal. Logout, password changes and session
  revocation still invalidate access early.
- Updated example configuration and backend documentation. All 63 backend tests
  including PostgreSQL pass (two upstream warnings); the login regression checks
  response duration, JWT lifetime and stored session expiry together.

## Live Dashboard - Implemented and Locally Verified

- Replaced demo measurements, weather, crop scores and advisories with farm-scoped
  API data, source/timestamp labels, device status and missing-data states.
- Added metric/date-window chart controls, bounded CSV export, refresh, optional
  60-second updates and a shadcn manual pH/NPK entry dialog. Independent resources
  isolate service failures; refresh preserves chart selection and open forms.
- TypeScript, focused ESLint, three data-helper tests and the final optimized
  frontend build pass. No backend code changed for this dashboard.
- Headless Chromium verified empty/populated farms, farm switching, chart date
  and metric filters, CSV export, manual pH zero saving, failed-save draft
  retention, automatic-refresh draft preservation and session-expiry redirect.
- Live Open-Meteo weather loaded; controlled weather/readings failures remained
  isolated. Desktop and 390px mobile screenshots, including the soil-test dialog,
  were reviewed with no horizontal overflow or page errors. Test farms removed;
  dedicated test accounts and security audit records retained.
- Chart history/export is bounded to the latest 500 readings per metric.
  Simulated inputs remain labeled; no hardware validation is claimed.
- Android-first Kotlin/Jetpack Compose was selected; mobile foundation work is
  tracked in the Android section above.

## Account Settings and Security - Implemented and Locally Verified

- Added migration `0010_account_security` for tracked login sessions and private
  security audit events, applied to the local database. Temporary PostgreSQL
  round-trip/model checks pass; existing records were preserved.
- Authentication now requires an active server-side session. Added profile name
  updates, current-password-verified password changes (revoke all sessions),
  individual/other-session revocation, server logout and paginated audit queries.
- Ten failed login/password checks in 15 minutes throttle known accounts.
  Security events contain action, timestamp and bounded user-agent, not secrets.
- Added `/settings` with Account, Security and Audit log tabs, shared navigation
  and floating assistant access. Profile name updates, password confirmation,
  active-session details and revocation confirmations are connected to the API.
- Audit history is private, paginated and filterable by event and UTC dates.
  Settings writes use an allowlisted same-origin proxy. Logout revokes backend
  sessions; Dashboard/Farms show errors rather than redirect on failed logout.
- All 63 backend tests including PostgreSQL pass (two upstream deprecation
  warnings). Optimized frontend build and TypeScript pass. Focused ESLint has
  zero errors and three navigation warnings for intentional full-page login
  redirects when sessions end.
- Headless Chromium verified profile saving, other-session revocation, wrong
  password errors, password rotation/cookie clearing, old-token rejection,
  backend logout, audit filtering/pagination, cross-origin write rejection and
  failed-logout handling. Desktop/mobile screenshots reviewed; no page errors
  or horizontal overflow at 390px. Dedicated test-account audit records retained.
- Older tokens require fresh sign-in. Audit coverage is account-security events
  only, not farm/order operations or tamper-proof storage. MFA, email verification,
  account recovery and global/IP-based rate limiting are not implemented.

## Floating Farm Chat - Implemented and Locally Verified

- Added a floating chat widget to all six signed-in web workspaces, backed by
  the existing farm-scoped chat API. Includes farm selection, minimize/reopen,
  clear conversation, retryable errors and a link to the full assistant.
- Widget conversations/drafts are isolated per farm and remain in memory across
  client-side workspace navigation. Public/auth routes unmount the widget.
  No browser storage or backend chat persistence was added.
- Uses farm-report context, with simulated-data disclosures from the API;
  photos are not attached to widget chats. Full assistant remains available.
- TypeScript, editor diagnostics, focused ESLint and final optimized build pass.
- Headless Chromium verified a live HTTP 200 chat reply, cross-page persistence,
  per-farm history/draft isolation, no-farm state, clear/minimize/reopen, Escape
  focus restoration, retained draft after a controlled 503 and logout reset.
  Desktop/mobile widget screenshots reviewed; at 390px the dialog stays within
  the viewport with no horizontal overflow or page errors. Test farms removed.
- Widget chat history is separate from the full assistant's chat and resets on
  reload/logout; no cross-tab synchronization or persistent history is claimed.

## Cash-on-Delivery Orders - Implemented and Locally Verified

- Added durable single-product orders with quantities, snapshotted pricing and
  vendor contacts, private delivery details, COD payment state, and additive
  migration `0009_marketplace_orders`, applied to the local application DB.
- Server checks reject demo/self/unavailable orders and changed prices. Duplicate
  checkout submissions reuse one order. Buyer/vendor ownership and locked status
  transitions protect updates; historical orders survive product deletion.
- Focused temporary-PostgreSQL order lifecycle and migration checks: 2 passed,
  including concurrent submissions, COD collection, cancellation and isolation.
- Checkout, buyer/vendor order tabs, date/status filters and pagination added.
  All 58 backend tests including PostgreSQL pass (two upstream warnings).
  TypeScript and touched-file editor diagnostics pass.
- Live headless Chromium verified COD checkout, saved totals, buyer cancellation,
  vendor confirmation/dispatch/delivery/cash-collection updates, date/status
  filtering and demo checkout blocking. No page errors or 390px horizontal
  overflow. Temporary test vendor hidden and product deleted; test order history
  retained for dedicated test accounts. No real delivery or cash collection.
- No online payments or shipping carrier integration; vendor confirmation is
  required for delivery at the saved total. Frontend TypeScript, focused ESLint
  and the final optimized production build pass. Desktop and mobile screenshots
  reviewed. Placement receipts do not claim a stale current order status.

## Vendor Marketplace - Implemented and Locally Verified

- Added vendor/product models and additive migration `0008_vendor_marketplace`.
  Temporary PostgreSQL migration round-trip and ORM consistency checks pass.
- Added authenticated onboarding, owner-only product/profile edits, searchable
  paginated catalog and five read-only fictional vendors across five categories.
- Added farm-context Gemini matching constrained to actual candidate product IDs,
  with simulated-input disclosure and optional unverified image observations.
  Four focused catalog/auth/AI-reference tests pass.
- Migration applied to the local database. Full backend suite with PostgreSQL
  integration enabled: 57 passed, two upstream deprecation warnings.
- Added authenticated `/marketplace`: search/category filters, paginated vendor
  browsing and contacts, onboarding, profile publication toggle, product CRUD,
  farm matching and optional browser crop-photo inference. Frontend TypeScript,
  focused ESLint, touched-file diagnostics and final production build pass.
- Live headless Chromium checks passed: onboarding, product creation, price/stock
  edits, search and vendor details. Desktop (1440px) and mobile (390px) screenshots
  reviewed; mobile has no horizontal overflow and no page errors were recorded.
  The temporary vendor was hidden and its test listings removed afterward.
- Actual browser crop-photo inference followed by Gemini matching returned HTTP
  200 with image context included and catalog-backed matches. The response noted
  missing soil readings, uncertain image results and fictional demo suppliers.
  This verifies integration, not agronomic accuracy or vendor quality.
- Five read-only demo vendors cover seeds, fertilizers, soil care, irrigation and
  crop care. AI considers up to 60 registered in-stock products plus demos;
  recommendations are not verified endorsements. Orders/payments and production
  deployment are not included.

## Completed Classifier and Assistant Wiring - 2026-09-14

- Persistent A100 training completed all 15 epochs; Modal has zero active tasks.
- Final checkpoint, ONNX, metadata, and split manifest downloaded to
  `ml/artifacts/mobilenetv3-plant-disease-a100-v1/mobilenetv3-plant-disease-v1/`.
  Local ONNX Runtime successfully loads the 39-class model.
- Final held-out dataset accuracy: 0.997236; top-3 accuracy: 0.999880;
  macro F1: 0.995894; log loss: 0.117824. Export parity maximum absolute
  difference: 2.7418e-6. These are dataset metrics, not field/hardware validation.
- Added bounded image observations to POST recommendations and chat, combined
  with current server-side sensor/XGBoost analysis. Browser predictions are
  explicitly unverified and not diagnoses; cross-farm observations are rejected.
  Five focused Gemini tests pass. Frontend proxy allows these routes with
  enough time for the backend's configured Gemini timeout.
- Added authenticated `/assistant` with farm-scoped analysis, browser MobileNet
  and YOLO inference, image uploads, camera snapshots, suggestions, and chat.
  Model and WASM assets are served locally through a fixed authenticated allowlist.
- Live browser inference on PlantDoc `IMG_5808.jpg` succeeded for both models;
  returned three detector boxes. Live image-grounded recommendations and chat
  returned HTTP 200. This verifies wiring, not model accuracy.
- Found and fixed Gemini output truncation (`MAX_TOKENS`): increased the response
  budget to 8192, require normal completion, join answer parts, exclude thoughts.
  Eight focused Gemini tests pass. Full backend suite: 48 passed,
  4 PostgreSQL integration tests skipped, two upstream deprecation warnings.
  Frontend TypeScript, focused ESLint, and production build pass. Resolved the
  whole-project asset-tracing warning with statically scoped allowlisted paths;
  the final build has no warnings. Model-label endpoint still returns 39 classes.
- Browser camera monitoring polls every 30 seconds while the image tab is visible,
  skips overlapping work, and stops on network errors. Real ESP32-CAM remains untested.
- Verified device-key ingestion on the dedicated Assistant Test Farm with eight
  explicitly simulated readings (two HTTP 201 batches). XGBoost returned ranked
  predictions; live Gemini combined these with actual browser image results,
  returned HTTP 200, and disclosed the simulated inputs and unverified image.
- Browser-tested a simulated camera HTTP 503: monitoring stops and an error is
  shown. At 390px and 1440px the DOM has no horizontal overflow; the mobile header
  hides the profile name. Integrated-browser screenshots were stale and stability
  checks stalled, so final visual approval remains pending. Mobile app not started.

## Modal A100 Plant-Disease Training - 2026-09-14

- Added a dedicated Modal launcher for the MobileNetV3-Large plant-disease
  classifier and configurable parallel data loading in the existing trainer.
- The first detached Modal application `ap-yF87bES82daHS2JvXl2tRv` was canceled
  after epoch 2 when its log-stream client was closed; the trainer itself did not
  fail. Replacement application `ap-PaP6uiR1bHRMrYWl1w9TnO` reached epoch 9 with
  validation accuracy 0.996271 before its waiting local client also ended.
- An attempted spawn from ephemeral application `ap-PeRtG3SsOuErkIz9G6Zsun`
  stopped with its parent before training began. Deployed the application
  persistently as `ap-EcPXnpJ7yPnlDgB9WSYJAd` and spawned durable function call
  `fc-01M2F0SBBNFGSJZBVANEW4HDC0`; the deployment has now completed with zero
  active tasks. Runtime logs confirmed an NVIDIA A100 80GB with CUDA 12.6,
  batch size 256, and eight data-loader workers.
- The 55,448-image, 39-class dataset is uploaded as its verified 828 MB archive.
  Checkpoints, ONNX output, and metadata are written to persistent Modal Volume
  `agrisense-plant-disease-artifacts` under
  `mobilenetv3-plant-disease-v1/`.
- Stopped the slower duplicate Apple MPS process after confirming the Modal GPU
  allocation. Its last completed result was epoch 4 with validation accuracy
  0.991941 and validation loss 0.186732; these are interim results, not final test
  metrics.
- Focused trainer validation passed (2 tests); both changed Python files compiled
  successfully and editor diagnostics reported no errors. Final untouched-test
  metrics and ONNX parity are recorded in the completed-classifier section above.

## Gemini Farm Suggestions and Chat - 2026-09-14

- Validated the configured Gemini API key against Google's live model endpoint;
  it returned HTTP 200 and exposes `gemini-3.6-flash`.
- Added typed backend settings for the secret key, model, and request timeout.
- Added owner-scoped `GET /farms/{farm_id}/recommendations` with schema-validated
  priorities, actions, reasons, precautions, and follow-up measurements grounded
  in the existing farm-analysis snapshot.
- Added owner-scoped `POST /farms/{farm_id}/chat` with bounded conversation
  history and the same current farm context. Responses label simulated-data
  dependency and include an AI-guidance disclaimer.
- The API key remains backend-only. Gemini failures return generic HTTP 503
  responses, and prompts prohibit invented readings or unqualified diagnosis and
  treatment claims.
- Live structured generation with `gemini-3.6-flash` returned schema-valid JSON.
  Focused Gemini tests passed (3 tests); the full backend suite passed with
  43 tests and 4 PostgreSQL integration tests skipped.

## Agreed Direction

- SIH problem statement 26180: field-deployable smart farming assistant.
- Development order: Python/FastAPI backend, web frontend, mobile app, IoT hardware.
- Hardware is planned, not assembled or connected.
- Simulated readings during software development; pH/NPK remain simulated until
  sensors are available.
- Planned inference: small exported XGBoost model on ESP32; YOLO locally in the
  web frontend/mobile app. Hardware fit and model performance require validation.

## Backend Foundation - 2026-09-11

- Created workspace `.venv` using Python 3.13.14.
- Installed FastAPI, Uvicorn, HTTPX, and pytest; direct versions recorded in
  `backend/requirements.txt`.
- Added FastAPI application with `GET /health` and automatic API documentation.
- Added a health endpoint test and local run instructions.
- Validation: health endpoint test passed (1 test); `pip check` reported no broken
  requirements. Third-party test libraries emitted two deprecation warnings.
- Started the backend on http://127.0.0.1:8000 with auto-reload using the workspace
  `.venv`. Added the VS Code task `Run AgriSense Backend` in `.vscode/tasks.json`.
- Live verification: `GET /health` returned HTTP 200 with
  `{"status":"ok","service":"agrisense-api"}` on 2026-09-11.
- At initial setup, database integration and application modules were deferred.

## Local Database - 2026-09-11

- Selected PostgreSQL for the multi-user backend and concurrent sensor ingestion.
- Reused the existing local PostgreSQL 14.19 (Homebrew) server.
- Created database `agrisense` on `localhost:5432`, owned by `redfoxhotels`.
- Verified a successful connection and zero public base tables after creation.
- Existing databases were not modified. At database creation, no FastAPI
  integration, schema, application database role, or credentials were added.

## FastAPI Database Integration - 2026-09-11

- Installed and pinned SQLAlchemy 2.0.52 with asyncio support, asyncpg 0.31.0,
  and pydantic-settings 2.15.0 in the existing workspace `.venv`.
- Added `backend/database.py`: environment settings, pooled async engine, and
  per-request sessions. Connections and queries have timeouts; shutdown disposes
  the pool. No schema creation or implicit commits were added.
- Added git-ignored `backend/.env` for the existing local connection and
  `backend/.env.example` as a setup template. Environment variables take precedence.
- Added `GET /health/db` for database readiness; `/health` remains independent.
- Verified five tests covering liveness, successful database queries, and generic
  HTTP 503 responses for SQLAlchemy, network, and timeout failures.
- `pip check` passed; editor diagnostics found no errors. Two existing third-party
  test-library deprecation warnings remain.
- Live server verification: `/health/db` returned HTTP 200 with
  `{"status":"ok","database":"agrisense"}`; `/health` also returned HTTP 200.
- Updated setup instructions. No tables, migrations, authentication, application
  storage APIs, weather integration, or model inference implemented yet.

## Users Migration and Authentication - 2026-09-13

- Reused the existing `.venv`; installed and pinned Alembic 1.20.0,
  pwdlib[argon2] 0.3.1, PyJWT 2.14.0, and email-validator 2.3.0.
- Added the users model and async Alembic infrastructure with revision
  `0001_create_users`. Offline migration SQL validation passed (1 test).
- Generated a random JWT signing secret in the existing git-ignored `.env`,
  without displaying the value. Existing connection settings were preserved.
- Implemented JSON registration/login and bearer-protected current-user APIs.
  Passwords use Argon2id, emails are normalized and unique, and JWT access tokens
  expire after 30 minutes by default. Invalid tokens and inactive users are denied.
- Auth, health, and offline migration tests passed (34 tests); editor diagnostics
  found no errors. The two existing upstream deprecation warnings remain.
- PostgreSQL integration checks passed in isolated temporary schemas: migration
  upgrade/downgrade/re-upgrade and model consistency, persisted auth lifecycle,
  inactive-user rejection, and concurrent duplicate signup protection.
- Applied `0001_create_users` to local `agrisense`; Alembic reports that revision
  at head. No existing application data was deleted; integration accounts lived
  only in temporary test schemas that were removed afterward.
- Full validation passed: 37 tests including the three real PostgreSQL tests;
  `pip check` reported no broken requirements. The two upstream warnings remain.
- Updated backend setup, migration, endpoint, and Swagger testing instructions.
  Token/profile responses disable caching. Public-deployment rate limiting,
  email verification/recovery, refresh tokens, and per-token logout are deferred.

## Web Frontend Foundation - 2026-09-13

- Created the Next.js 16 App Router frontend with React 19, TypeScript, Tailwind
  CSS 4, local Inter fonts, shadcn/Radix UI components, Lucide icons, and Recharts.
- Added animated registration and login pages backed by a same-origin Next.js
  auth proxy. Access tokens are stored in secure HTTP-only cookies rather than
  browser storage; logout clears the session cookie.
- Added auth-aware root routing and a server-protected dashboard that validates
  the session through FastAPI `GET /auth/me` before rendering.
- Added an elegant responsive farm dashboard with desktop/mobile navigation,
  overview metrics, a moisture chart, weather, crop-health summaries, advisories,
  account controls, and logout. Simulated sensor values and dependent guidance
  are visibly labeled as simulated.
- Applied the AgriSense green visual system, responsive behavior, entry/success
  animations, and reduced-motion support across authentication and dashboard UI.
- Validation passed: frontend TypeScript check, ESLint, editor diagnostics, and
  optimized Next.js production build. Runtime auth flow still requires both local
  backend and frontend servers to be running.
- Fixed the Tailwind font token so it resolves to the locally bundled Inter family
  instead of a circular CSS variable. Browser verification confirmed computed
  `Inter, sans-serif` styles and a loaded Inter font on the login page.
- Connected and browser-tested the complete frontend authentication flow through
  the Next.js same-origin proxy to FastAPI and PostgreSQL. Registration returned
  201, login returned 200, the HTTP-only session authenticated `/auth/me`, and the
  protected dashboard rendered the signed-in user's greeting.
- Corrected local development hydration for `127.0.0.1` via `allowedDevOrigins`,
  hardened the proxy's same-host origin comparison, and set an explicit POST form
  fallback so credentials cannot be placed in query parameters. Frontend lint
  passed after these changes.

## Farms and IoT Device Registry - 2026-09-13

- Added user-owned farms with name, location, optional area, timestamps, complete
  CRUD APIs, and owner-scoped queries that prevent cross-user access.
- Added multiple IoT devices per farm with unique serial numbers, virtual/physical
  mode, sensor capabilities, active state, and one-time provisioning keys. Only
  SHA-256 key hashes are stored in PostgreSQL.
- Added authenticated device heartbeats and computed connection states:
  `connected` within five minutes, `offline` afterward, and `never_connected`
  before the first heartbeat. Detection applies to provisioned devices that call
  the API; arbitrary network hardware is not automatically scanned.
- Current development devices are virtual. Manual sensor readings remain the next
  backend phase and will be labeled simulated, including pH/NPK and dependent
  predictions, until hardware is integrated.
- Added and applied migration `0002_farms_iot` to the existing local database with
  no data deletion. Alembic reports it at head.
- Validation passed: 38 backend tests, including real PostgreSQL migration/model
  consistency, farm ownership isolation, two-device provisioning, invalid-key
  rejection, successful heartbeat, and connection-state checks. Editor diagnostics
  and Python compilation passed; the live OpenAPI schema exposes the new routes.

## Farm and Device Web Workspace - 2026-09-13

- Added the protected `/farms` workspace and shared route-aware desktop/mobile
  navigation, matching the existing AgriSense dashboard and shadcn/Radix UI.
- Added responsive farm selection, create/edit/delete dialogs, empty states, and
  user-owned farm details with location and optional area.
- Added device registration for virtual or physical devices, flexible sensor
  capability selection, multiple device cards per farm, and heartbeat-derived
  `connected`, `offline`, and `never_connected` status labels.
- Added secure one-time provisioning-key presentation with copy support. Raw keys
  are not fetched again after the registration dialog is closed.
- Added a constrained authenticated same-origin Next.js proxy for the user-facing
  farm and device APIs; the browser never needs direct access to the JWT cookie.
- Browser validation passed at mobile and desktop sizes with no horizontal
  overflow. A farm and two virtual devices were created through the live FastAPI
  and PostgreSQL flow, including a pH/NPK-only device; both devices correctly
  remained `never_connected` before their first heartbeat.
- Frontend TypeScript, ESLint, editor diagnostics, and the optimized Next.js
  production build passed. The build includes dynamic `/farms` and
  `/api/farms/[[...path]]` routes.
- Suppressed hydration warnings at the root `<body>` boundary for attributes
  injected by browser extensions, including `cz-shortcut-listen`. A clean browser
  reload produced no hydration messages, console errors, or page errors; ESLint
  also passed.
- Added ESP32-CAM as a first-class device type with a `camera` capability in the
  backend contract and registration UI. Camera cards identify crop-image capture
  for YOLO disease analysis; inference remains in the web/mobile applications,
  not on the ESP32-CAM.
- Real PostgreSQL lifecycle validation passed with an ESP32-CAM alongside two
  sensor nodes, including camera capability persistence. Frontend TypeScript,
  ESLint, editor diagnostics, and the optimized production build also passed.

## Farm Location and Weather Module - 2026-09-13

- Added nullable paired WGS84 latitude/longitude fields to farms with database
  bounds and pairing constraints. Existing farms remain valid and can be edited
  later to add exact coordinates.
- Added and applied non-destructive migration `0003_farm_coordinates` to the local
  `agrisense` database. Alembic reports the revision at head.
- Added authenticated Open-Meteo location search and owner-scoped seven-day farm
  forecasts. Forecasts include temperature, humidity, rain probability, rainfall,
  weather codes, and FAO reference evapotranspiration (ET0).
- Added farm-form place search and browser GPS selection. Changing the location
  text clears stale coordinates until a result or current position is selected.
- Added the protected `/weather` workspace, shared navigation entry, authenticated
  Next.js weather proxy, current conditions, seven daily cards, rain/ET0 outlooks,
  and Open-Meteo attribution.
- Weather outlooks are planning context only. Final irrigation recommendations
  remain deferred until live soil-moisture ingestion is implemented.
- Full backend validation passed: 40 tests including isolated real PostgreSQL
  migration and ownership checks; two upstream deprecation warnings remain.
- Frontend TypeScript, ESLint, editor diagnostics, and optimized Next.js build
  passed. The build includes dynamic `/weather` and `/api/weather/[[...path]]` routes.
- Live browser verification passed through registration, farm creation, Open-Meteo
  geocoding, coordinate persistence, and forecast loading. Nagercoil resolved to
  `8.17899, 77.43227`; the proxy returned HTTP 200 with seven days. Desktop and
  390px mobile views had no page-level horizontal overflow or console errors.

## Capability-Based Device Registration - 2026-09-13

- Simplified IoT registration to device name, globally unique serial number, and
  one or more capabilities. A single device can expose any supported combination
  of sensors and camera input, so hardware categories such as ESP32 or ESP32-CAM
  are no longer selected separately.
- Removed device-wide `virtual`/`physical` mode. Input source belongs to each
  reading and will be selected as device or simulated when ingestion is added.
  pH and NPK values remain manual for now and their dependent predictions must be
  labeled simulated.
- Added and applied non-destructive migration `0004_simplify_iot_devices`; existing
  devices, serial numbers, capability lists, provisioning hashes, and heartbeat
  history were preserved. Alembic reports revision `0004` at head.
- Focused offline migration validation and the real PostgreSQL device lifecycle
  test passed, including capability persistence, ownership isolation, secure
  provisioning, and heartbeat state.

## Recorded and Detected Soil Types - 2026-09-13

- Added an optional recorded soil type to farm create/edit using constrained
  categories. It represents farmer observation or a confirmed soil test.
- Added separate nullable detected soil type, confidence, and detection timestamp
  fields. They are read-only in farm CRUD and do not overwrite recorded soil.
- The farm workspace shows recorded and detected values independently. Detection
  displays `Not analyzed` until a validated detector produces a real result.
- Added and applied non-destructive migration `0005_farm_soil_types`; existing
  farm data was preserved and Alembic reports revision `0005` at head.
- Full backend validation passed with PostgreSQL: 40 tests and two existing
  upstream deprecation warnings. Frontend TypeScript, ESLint, and editor
  diagnostics passed.
- Automatic soil detection is not yet implemented. Current manual pH/NPK,
  moisture, and weather inputs are not claimed to identify soil texture reliably.

## Sensor Reading Ingestion and Monitoring - 2026-09-13

- Added one-row-per-metric sensor storage with source (`device`, `manual`, or
  `simulated`), optional device, measurement time, ingestion time, and fixed units.
- Added device-key ingestion for soil moisture, temperature, humidity, pH, and
  NPK. Requests validate active device ownership, declared capabilities, allowed
  ranges, and source provenance before committing any readings.
- Added owner-authenticated manual pH/NPK entry plus owner-scoped reading history,
  metric filtering, limits, and latest-per-metric APIs. Manual values are stored
  without a device and cannot be used to submit temperature, humidity, or moisture.
- Added and applied additive migration `0006_sensor_readings`; existing records
  were preserved and Alembic reports `0006_sensor_readings (head)`.
- Added the protected `/readings` frontend workspace and constrained same-origin
  proxy routes. It provides farm selection, seven real latest-value cards, source
  badges, persisted soil-moisture history, recent readings, empty/error/loading
  states, and a manual pH/NPK dialog. No placeholder sensor values are rendered.
- PostgreSQL validation passed: 40 backend tests covering keys, capabilities,
  ranges, physical/simulated/manual sources, ownership isolation, latest values,
  persistence, and all prior functionality. The two upstream warnings remain.
- Frontend TypeScript and ESLint passed. Hardware integration, XGBoost training,
  soil detection, and predictions remain deferred and are not claimed as verified.

## ML Toolchain Installation - 2026-09-13

- Installed and pinned XGBoost 3.4.1 and Ultralytics 8.4.150 in the existing
  workspace `.venv`; no additional Python environment was created.
- Installed Homebrew `libomp` 23.1.1 and linked it into the machine's custom
  Homebrew prefix so XGBoost's native macOS library can load.
- Installed `onnxruntime-web` in the frontend for future local execution of an
  exported YOLO ONNX model. npm reported zero known vulnerabilities.
- Verified imports for XGBoost, Ultralytics, and PyTorch 2.14.0. Dependency
  installation does not constitute model training, accuracy validation, disease
  detection, soil analysis, or ESP32 deployment; those require datasets and tests.

## ML Sample Smoke Tests - 2026-09-13

- Trained a small XGBoost binary classifier on 160 synthetic sensor-like rows and
  inferred on 40 held-out rows. All predictions were finite, ranged from 0.0184
  to 0.9804, and synthetic holdout accuracy was 0.950. This validates the fit and
  predict pipeline only; the generated labels are not agronomic ground truth.
- Loaded official pretrained YOLO11n weights and ran inference on Ultralytics'
  standard 1080x810 bus sample. The pipeline returned five detections: one bus
  and four people. This validates model download, image preprocessing, and object
  detection execution, not crop-disease recognition.
- Loaded `onnxruntime-web` 1.29.0 successfully in the frontend Node environment.
  Browser inference against an exported crop-disease model remains pending until
  suitable trained weights and representative crop images are available.
- Retained the downloaded `backend/yolo11n.pt` and `backend/bus.jpg` locally for
  repeatable smoke testing. Generated `.pt` and `.onnx` weights are git-ignored.

## Structured Farm Analysis Inputs - 2026-09-13

- Added owner-scoped `GET /farms/{farm_id}/analysis` and exposed it through the
  constrained read-only frontend farm proxy.
- The endpoint selects the newest value for each of the seven sensor/manual
  metrics and preserves value, unit, source, and measurement time. It reports
  missing and stale metrics, input status, and whether simulated data is present.
- Physical/simulated sensor inputs become stale after six hours; manual pH/NPK
  inputs become stale after 30 days. These are input-readiness windows, not crop
  treatment thresholds or agronomic predictions.
- The model result is explicitly `unavailable` with no version because no
  validated AgriSense XGBoost artifact is configured. The API does not fabricate
  a prediction from the earlier synthetic runtime smoke test.
- Validation passed: 37 default backend tests with four PostgreSQL skips, 41
  PostgreSQL-backed tests, and editor diagnostics on all touched files. The two
  existing upstream test-library deprecation warnings remain.

## XGBoost Crop-Suitability Training - 2026-09-13

- Collected version 1 of Atharva Ingle's Kaggle Crop Recommendation Dataset under
  its Apache 2.0 license and retained the Kaggle metadata plus raw ZIP. The CSV
  SHA-256 is `54a5a6e5408668e668667efc50de2fc867c1b875e0431b4f54dd331b0a109a4e`.
- Audited 2,200 rows with seven numerical inputs (`N`, `P`, `K`, temperature,
  humidity, pH, and rainfall), 22 crop labels with 100 rows each, no missing
  values, and no exact duplicate rows.
- Added `ml/train_xgboost.py` with strict schema checks, deterministic class-
  stratified 70/15/15 splits, early stopping, per-class metrics, feature
  importance, dataset checksums, and versioned model metadata.
- Trained `ml/artifacts/xgboost-crop-suitability-v1/model.ubj` independently on
  1,540 training rows, selected iterations using 330 validation rows, and kept
  330 rows untouched for final evaluation. Test accuracy was 0.9909, top-3
  accuracy 1.0000, macro F1 0.9909, and multiclass log loss 0.7144.
- The artifact is limited to crop-suitability classification on the source
  dataset. It is not evidence for irrigation need, drought, yield, disease,
  hardware performance, or real-field accuracy. The source dataset was assembled
  through augmentation, so external field validation remains required.
- Focused ML tests passed (3 tests), and editor diagnostics found no errors in
  the trainer or tests.

## YOLO PlantDoc Collection - 2026-09-13

- Verified PlantDoc Object Detection as a CC BY 4.0 source with train/test images
  and bounding-box CSV columns `filename,width,height,class,xmin,ymin,xmax,ymax`.
- A complete extracted copy is available at
  `ml/data/raw/PlantDoc-Object-Detection-Dataset-master`: 2,354 readable training
  images, 239 readable test images, 2,346 training XML files, 237 test XML files,
  both CSV annotation files, and the CC BY 4.0 `LICENSE.txt`.
- The earlier 4,720/476 repository counts included paired image and Pascal VOC XML
  blobs; they were not image-only counts.
- Audit found three training XML files whose referenced images are absent, four
  XML files with zero stored dimensions, one within-split duplicate group, and 11
  exact image hashes shared by train and test. Conversion must derive dimensions
  from readable images, exclude unmatched annotations, and remove train-side
  copies of official-test images before creating a validation split.
- The dataset is sufficient for YOLO preparation and training. No plant-disease
  YOLO accuracy or trained artifact was claimed before conversion, training, and
  held-out evaluation completed.

## PlantDoc YOLO Training - 2026-09-13

- Added `ml/prepare_plantdoc_yolo.py` and three passing focused tests for actual
  image-dimension repair, YOLO box normalization, missing-image handling, and a
  deterministic validation split that preserves every class in training.
- Converted Pascal VOC XML into an isolated YOLO dataset with 1,970 train images
  and 7,221 boxes, 348 validation images and 1,171 boxes, and 236 official-test
  images and 452 boxes. All 29 classes occur in train and validation.
- Excluded 15 malformed/empty/unmatched training annotations, one empty test
  annotation, two exact within-train duplicates, and 11 train copies whose image
  bytes also occur in the official test split. Raw files are not hard-linked to
  processed files, so Ultralytics JPEG repair cannot modify the source dataset.
- Trained YOLO11n from `backend/yolo11n.pt` at 512px with batch 4, seed 26180,
  Apple MPS, and early stopping. Training stopped after 42 of 50 epochs; best
  validation epoch was 32 with precision 0.4410, recall 0.4917, mAP50 0.4550,
  and mAP50-95 0.3175.
- The best checkpoint scored precision 0.4614, recall 0.6403, mAP50 0.5844, and
  mAP50-95 0.4567 on the official PlantDoc test split. That test split contains
  27 of 29 classes, excluding `Potato leaf` and
  `Tomato two spotted spider mites leaf`; these metrics are not field validation.
- Saved `ml/artifacts/yolo-plantdoc-v1/weights/best.pt`, `last.pt`, evaluation
  plots, metadata, and `best.onnx`. PyTorch and ONNX produced the same class and
  confidence (0.560322) on a detected official-test example. `pip check` passed.

## Fresh Saved-Model Evaluation - 2026-09-14

- Reloaded the saved XGBoost `model.ubj` and evaluated the deterministic untouched
  330-row test split. It reproduced accuracy 0.9909 (327/330), top-3 accuracy
  1.0000, macro F1 0.9909, and multiclass log loss 0.7144 across all 22 classes.
  The three errors were rice as jute, grapes as apple, and maize as cotton.
- Reloaded YOLO `best.pt` and `best.onnx` independently and evaluated both over
  all 236 official-test images and 452 boxes at 512px. Both produced mAP50
  0.584365 and mAP50-95 0.456659; recall was 0.640321 and precision differed by
  only 0.00000022, confirming aggregate deployment parity for this test set.
- On the local Apple M1 CPU, measured model inference was 25.64 ms/image for
  PyTorch and 19.02 ms/image for ONNX Runtime. These timings do not establish
  browser, mobile, ESP32, or field performance.
- Saved checksummed, per-class fresh reports at
  `ml/artifacts/xgboost-crop-suitability-v1/fresh-evaluation.json` and
  `ml/artifacts/yolo-plantdoc-v1/fresh-evaluation.json`.
- The limitations remain unchanged: XGBoost is crop-suitability classification
  only, while PlantDoc test metrics cover 27 of 29 detector classes and are not
  external field validation. No hardware accuracy claim has been made.

## Hugging Face Disease Dataset Audit - 2026-09-14

- Reviewed 96 Hugging Face plant-disease search results for task type, license,
  annotation format, provenance, and compatibility with the current detector.
- Excluded `susnato/plant_disease_detection_processed` because its 2,324 rows are
  explicitly derived from the same PlantDoc repository already collected.
- Excluded `LibreYOLO/cotton-plant-disease` from collection because its only class
  is the undefined label `dc`, which cannot be mapped responsibly to the current
  disease taxonomy without stronger source documentation.
- Collected the CC BY 4.0 `rick003/plant-disease-clean-v1` archive in an isolated
  raw directory. ZIP integrity passed; its 1,896 images use 17 labels that exactly
  match existing PlantDoc classes. The archive SHA-256 is
  `acbf65a2dd8d43bb80b654d45357f0716fc67d7be6f715875d6b9079744a86ea`.
- Exact byte hashes found no overlap, but perceptual hashing identified 1,030 of
  1,896 images as candidate resized/recompressed PlantDoc duplicates at Hamming
  distance 4. The source is not merged into training; at most 866 potentially new
  images require stricter duplicate and annotation review first.

## Mendeley Classification Dataset Collection - 2026-09-14

- Completed the resumed download of the 828 MB unaugmented Plant Leaf Diseases
  Dataset archive from Mendeley Data under CC0 1.0.
- Full ZIP integrity validation passed. The archive SHA-256 is
  `ac3432453984d02a86197987e775a5429d0d59e7cc7c35bcf5a8f50349b90ff0`.
- The publisher reports 61,486 images across 39 classes. This is classification
  data without bounding boxes; it remains separate from YOLO detector training
  and is suitable only for a separately designed disease-classification pipeline.

## XGBoost Farm-Analysis API - 2026-09-14

- Replaced the farm-analysis endpoint's placeholder model state with inference
  from the validated `xgboost-crop-suitability-v1` artifact. The service checks
  metadata feature order before loading the saved UBJ model and returns ranked
  top-three crops, confidence values, model version, and the model's limited
  crop-suitability scope.
- Added rainfall as a first-class device/simulated reading and device capability.
  Applied additive migration `0007_rainfall_metric` to the existing local
  database; Alembic reports it at head and existing rows were preserved.
- Prediction requires fresh N, P, K, temperature, humidity, pH, and rainfall.
  Soil moisture remains in overall farm readiness but is not passed to XGBoost.
  Open-Meteo precipitation is not substituted for training rainfall because the
  source dataset does not establish a compatible measurement window.
- Incomplete or stale model inputs return `not_ready` with exact missing/stale
  metrics. Successful responses return `predicted`; predictions depending on
  simulated inputs are explicitly marked with `uses_simulated_data: true`.
- Validation passed: four focused model/analysis tests, four isolated real
  PostgreSQL tests covering migration, rainfall persistence, ownership, and live
  inference, plus the full default backend suite with 40 passed and four opt-in
  PostgreSQL tests skipped. Editor diagnostics found no errors. Gemini advice,
  chatbot, disease-image analysis, and alerts remain separate next modules.