# AgriSense Backend

Python 3.13 / FastAPI backend. The shared development environment is
`.venv` at the workspace root, outside this backend directory.

## Dependencies

From the workspace root:

```sh
.venv/bin/python -m pip install -r backend/requirements.txt
```

FastAPI provides the API, Uvicorn runs the server, HTTPX supports HTTP clients
and API tests, and pytest runs tests. SQLAlchemy and asyncpg provide asynchronous
PostgreSQL sessions; pydantic-settings loads environment configuration. XGBoost
and Ultralytics provide the installed model training and export toolchains.
HTTPX also calls Gemini through Google's REST API; configure `GEMINI_API_KEY`
and optionally `GEMINI_MODEL` (default `gemini-3.6-flash`).

Alembic manages schema migrations. Authentication uses pwdlib/Argon2 for password
hashing, PyJWT for signed access tokens, and email-validator for email validation.

Configure the environment and apply migrations as described below before starting
the server on a fresh checkout.

## Run Locally

From the workspace root:

```sh
cd backend
../.venv/bin/python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

- Health: http://127.0.0.1:8000/health
- Database readiness: http://127.0.0.1:8000/health/db
- Interactive API docs: http://127.0.0.1:8000/docs
- OpenAPI schema: http://127.0.0.1:8000/openapi.json

If port 8000 is occupied, select a different port with `--port`.

## Tests

From the backend directory:

```sh
../.venv/bin/python -m pytest tests -q
```

By default, the tests mock database sessions and generate migration SQL without
modifying PostgreSQL; four PostgreSQL integration tests are skipped. Environment
configuration is still required to import the app.

To also test actual migrations, authentication, concurrent duplicate signups,
farm ownership, and IoT device connection state against PostgreSQL:

```sh
AGRISENSE_POSTGRES_TESTS=1 ../.venv/bin/python -m pytest tests -q
```

Integration tests create unique `test_auth_<uuid>` schemas, run migrations and
test accounts there, and remove only those schemas afterward. They do not use or
modify application tables or user accounts. The database role needs permission
to create schemas. The migration downgrade test runs only in a test schema.

## Local Database

A PostgreSQL database named `agrisense` has been created on the existing
local server at `localhost:5432` (PostgreSQL 14.19, owner `redfoxhotels`).
Migration `0006_sensor_readings` has been applied locally. The database contains
`users`, `farms`, `iot_devices`, `sensor_readings`, and Alembic's revision
tracking table.

Connect locally:

```sh
psql -h localhost -U redfoxhotels -d agrisense
```

FastAPI is connected through the async engine and `get_db` session dependency in
`database.py`. Connections are acquired when needed and the pool is disposed on
application shutdown. Sessions close after each request; future write endpoints
must explicitly commit their transactions.

The required `DATABASE_URL` and `JWT_SECRET_KEY` are configured in the git-ignored
`backend/.env`.
For a fresh checkout, create that file using `.env.example`, replacing
`YOUR_DATABASE_USER` with the local PostgreSQL role. The URL must use the
`postgresql+asyncpg://` driver. Environment variables override the file, which is
resolved relative to `database.py`, not the terminal's working directory.

Generate a signing secret from the backend directory. This command preserves an
existing key and never prints the secret:

```sh
../.venv/bin/python -c 'from pathlib import Path; from secrets import token_urlsafe; from dotenv import dotenv_values, set_key; path = Path(".env"); existing = dotenv_values(path).get("JWT_SECRET_KEY"); set_key(path, "JWT_SECRET_KEY", token_urlsafe(48)) if not existing else None'
```

The signing key must have at least 32 characters. Use a randomly generated value,
not an example or memorable phrase. `ACCESS_TOKEN_EXPIRE_MINUTES` defaults to 21600
(15 days) and accepts values from 1 to 21600. New logins use this fixed lifetime
for the token, server session and browser cookie; existing logins keep their
original expiry. Logout, session revocation and password changes can end sessions
earlier. Changing the signing key invalidates all
existing access tokens. Never commit the real `.env` or signing key.

`GET /health/db` queries PostgreSQL and returns
`{"status":"ok","database":"agrisense"}` when connected, or HTTP 503 with a
generic message when unavailable. `GET /health` is a separate liveness endpoint
and does not query the database.

No tables or schema migrations are created automatically. The existing
`redfoxhotels` role is used only for this local development setup; production
needs a dedicated least-privilege role and independently managed credentials.

## Migrations

From the backend directory:

```sh
../.venv/bin/python -m alembic upgrade head
../.venv/bin/python -m alembic current
```

The users table has a UUID primary key, normalized unique email, full name,
Argon2id password hash, active flag, and timezone-aware creation timestamp.
UUIDs are generated by the application; PostgreSQL provides the active/timestamp
defaults. The unique constraint also prevents concurrent duplicate signups.

After a future model change, generate and review a new migration before applying:

```sh
../.venv/bin/python -m alembic revision --autogenerate -m "describe_change"
```

Migrations use the configured database URL; credentials are not stored in
`alembic.ini`. Do not run downgrades against valuable data without a reviewed
backup/recovery plan: the initial revision's downgrade drops the users table.

## Authentication

| Endpoint | Request | Result |
| --- | --- | --- |
| `POST /auth/register` | JSON `full_name`, `email`, `password` | 201 with public user fields |
| `POST /auth/login` | JSON `email`, `password` | 200 with `access_token`, `token_type`, `expires_in` (seconds) |
| `GET /auth/me` | `Authorization: Bearer <access_token>` | 200 with the authenticated user's public fields |

Registration requires a nonblank name of up to 100 characters, a valid email of
up to 254 characters, and a password of 12-128 characters. Names are trimmed and
emails lowercased. Passwords are not trimmed or modified. Extra request fields
are rejected, so clients cannot assign IDs or active flags. Passwords and hashes
are excluded from user responses, and validation errors omit submitted values.

Duplicate emails return 409; invalid request bodies return 422. Login failures
(unknown email, wrong password, inactive user) return the same generic 401.
Missing, invalid, expired, or incorrectly signed tokens return 401 with a Bearer
challenge. Access tokens are restricted to HS256 with issuer, audience, token
type, time, and UUID subject checks. Each protected request checks that the user
still exists and is active. Token/profile responses are marked `no-store`.

To try the flow in http://127.0.0.1:8000/docs:

1. Execute `/auth/register` with your name, email, and chosen password.
2. Execute `/auth/login` using that email and password.
3. Open **Authorize** and enter the returned access token without the `Bearer` prefix.
4. Execute `/auth/me`; without authorization it returns 401.

Future protected routes should depend on `security.get_current_user` and scope
their queries to that user's ID. Registration/login remain public; `/health` and
`/health/db` also remain public.

This is local-development authentication, not complete production hardening.
Before public deployment, enforce HTTPS and login/registration rate limits.
Email verification, password recovery, refresh tokens, and per-token server-side
logout/revocation are not implemented. Tokens expire automatically; deactivating
a user immediately prevents further protected access.

## Farms and IoT Devices

Farm routes require a valid user bearer token. Every query is scoped to the
authenticated owner; another user receives 404 rather than learning whether a
farm or its devices exist.

| Endpoint | Result |
| --- | --- |
| `POST /farms/` | Create a farm with `name`, `location`, optional paired coordinates, `area_hectares`, and recorded `soil_type` |
| `GET /farms/` | List the authenticated user's farms |
| `GET /farms/{farm_id}` | Read an owned farm |
| `PATCH /farms/{farm_id}` | Update supplied farm fields |
| `DELETE /farms/{farm_id}` | Delete a farm and its devices |
| `POST /farms/{farm_id}/devices` | Register and provision an IoT device |
| `GET /farms/{farm_id}/devices` | List devices and computed connection states |
| `POST /farms/{farm_id}/devices/{device_id}/heartbeat` | Authenticate a device and mark it connected |

A farm can own multiple devices, and each device can expose several sensor or
camera capabilities. Provisioning requires a globally unique serial number and
one or more capabilities. A device with the `camera` capability can capture crop
images; YOLO disease prediction runs in the web or mobile application rather than
on the camera. Provisioning returns a high-entropy
`device_key` once. Only its SHA-256
hash is stored; the raw key is never returned by listing endpoints and should be
saved securely in the device configuration.

Devices authenticate heartbeat and reading-ingestion requests with
`X-Device-Key`. A successful
heartbeat updates `last_seen_at`. Device listings report `connected` when an
active device checked in during the last five minutes, `offline` after that
window, and `never_connected` before its first heartbeat. This means AgriSense
finds provisioned devices when they contact the API; it does not scan the local
network for unknown hardware.

Farm create and update requests may set an optional recorded `soil_type` from the
supported categories. Responses expose that separately from nullable
`detected_soil_type`, `soil_type_confidence` (0 to 1), and
`soil_type_detected_at`. Detection metadata is read-only through farm CRUD and
remains empty until a validated detector is implemented; current pH/NPK,
moisture, and weather inputs are not presented as reliable soil-texture detection.

## Sensor Readings

Each measurement is stored as one row with its metric, value, unit, source,
optional device, measurement time, and ingestion time. Sources are `device`,
`manual`, or `simulated`, preserving provenance independently for every value.

| Endpoint | Authentication | Result |
| --- | --- | --- |
| `POST /farms/{farm_id}/devices/{device_id}/readings` | `X-Device-Key` | Ingest supported device or simulated metrics |
| `POST /farms/{farm_id}/readings` | Owner bearer token | Record manual pH and N/P/K soil-test values |
| `GET /farms/{farm_id}/readings` | Owner bearer token | List recent readings, optionally filtered by `metric` |
| `GET /farms/{farm_id}/readings/latest` | Owner bearer token | Return the newest reading for each metric |

Device ingestion checks that the device is active, belongs to the route's farm,
and advertises every submitted capability. Accepted metrics are soil moisture,
temperature, humidity, rainfall, pH, nitrogen, phosphorus, and potassium; values are
range-validated. Manual owner entry is intentionally limited to pH and NPK and
does not assign a device. Until hardware is connected, simulated device values
and any predictions based on simulated pH/NPK must remain visibly labeled.

## Farm Analysis

`GET /farms/{farm_id}/analysis` returns an owner-scoped snapshot of the newest
farm readings, including provenance, missing and stale metrics, and whether any
input is simulated. It runs the validated XGBoost crop-suitability model only
when fresh nitrogen, phosphorus, potassium, temperature, humidity, pH, and
rainfall readings are available. A successful result contains the ranked top
three crop predictions, model version, confidence values, and model scope.

Soil moisture remains part of overall farm readiness but is not passed to this
model because it was not a training feature. Rainfall must be ingested as its
own measured or simulated metric; weather precipitation is not substituted
because its time window is not known to match the training dataset. Predictions
depending on simulated readings set `uses_simulated_data` to `true`.

## Gemini Farm Assistant

Gemini routes require a valid owner bearer token and ground responses in the
same latest-reading snapshot used by farm analysis.

| Endpoint | Result |
| --- | --- |
| `GET /farms/{farm_id}/recommendations` | Return schema-validated suggestions, reasons, precautions, and follow-up measurements |
| `POST /farms/{farm_id}/recommendations` | Generate the same suggestions with optional browser image observations |
| `POST /farms/{farm_id}/chat` | Answer a farm-specific question with up to 12 prior user/assistant messages |

Responses identify the Gemini model, disclose whether the context contains
simulated data, and include an AI-guidance disclaimer. Prompts require Gemini to
state when inputs are missing, stale, or simulated and prohibit invented farm
measurements or confirmed diagnoses. API keys remain on the backend, and
upstream failures return a generic HTTP 503 response.

Both POST routes accept an optional `image` observation containing the matching
`farm_id`, `captured_at`, `source` (`upload` or `camera`), classifier and detector
versions, one to three classifications, and up to twenty detections. Each result
has a label and a bounded confidence score. Observations are client-reported,
unverified context, not confirmed diagnoses; cross-farm observations are rejected.
Only normally completed Gemini responses are accepted. Truncated or blocked
responses return HTTP 503 rather than partial advice.

The web `/assistant` workspace runs MobileNetV3 and YOLO ONNX models locally,
combines their observations with backend sensor/XGBoost analysis, and provides
suggestions and chat. Uploads support JPEG, PNG, and WebP up to 10 MB. Camera
snapshots require a browser-accessible HTTP(S) endpoint with CORS support;
HTTPS pages may block HTTP cameras. Optional 30-second monitoring runs only
while the image tab and document are visible. It is not background monitoring
and has not been tested with ESP32 hardware.

Authenticated `/api/vision-assets/[asset]` serves a fixed allowlist of models,
class labels, and installed ONNX Runtime WASM assets. Run Next.js from `frontend`
and preserve the sibling `ml/artifacts` directory on deployment, including
`mobilenetv3-plant-disease-a100-v1/mobilenetv3-plant-disease-v1/model.onnx`, its
`metadata.json`, and `yolo-plantdoc-v1/best.onnx`. Raw photos stay in the browser;
only prediction labels/scores and observation metadata are sent for guidance.

## Weather

Weather routes require a valid user bearer token. Open-Meteo provides place
search and seven-day forecasts without an application API key for its public
non-commercial endpoint.

| Endpoint | Result |
| --- | --- |
| `GET /weather/locations?query=Nagercoil` | Search locations and return exact WGS84 coordinates |
| `GET /weather/farms/{farm_id}` | Return current conditions and a seven-day forecast for an owned farm |

Farm latitude and longitude are nullable so existing farms remain valid, but
they must be supplied together and remain within valid geographic bounds. A farm
without coordinates can be edited later to select an exact location.

Forecast days include temperature, relative humidity, precipitation probability,
rainfall, weather code, and FAO reference evapotranspiration (ET0). The returned
weather outlook is descriptive planning context. Final irrigation advice is
deferred until live soil-moisture readings are available.

## Current Scope

Database connectivity, health endpoints, users, Alembic migrations, authentication,
farm CRUD, multi-device provisioning, heartbeat-based connection detection, and
source-aware sensor reading storage are implemented. Coordinate-aware Open-Meteo
location search, seven-day farm weather forecasts, and XGBoost crop-suitability
inference through the farm-analysis endpoint are also implemented. Gemini-backed
structured farm suggestions and contextual chat are implemented. Browser-local
plant-image inference is connected to those routes. Alerts and final irrigation
advice are not implemented yet; mobile and real hardware validation remain pending.

Development order: backend, web frontend, mobile app, then IoT hardware.
Use simulated sensor inputs during software development; pH/NPK remain simulated
until sensors are available. Planned inference placement is a small converted
XGBoost model on ESP32 and YOLO in the web frontend/mobile app, subject to testing.

The development environment includes XGBoost 3.4.1 and Ultralytics 8.4.150.
On macOS, XGBoost also requires Homebrew `libomp`. The frontend includes
`onnxruntime-web` for local execution of the exported image ONNX models.
Validated model results and limitations are recorded in the workspace
`PROGRESS.md`; no hardware deployment or field accuracy is claimed.