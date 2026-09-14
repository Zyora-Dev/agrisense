# AgriSense Android

Native Kotlin + Jetpack Compose, Android 8.0/API 26 or later. Development stays
in this workspace. Android Studio, an emulator and a local Android SDK are not
required when building through GitHub Actions.

## Screen suite (0.2.0)

- Registration/login and configurable API base URL; no production address is
  assumed. Set the reachable FastAPI base URL from the sign-in server icon.
  Debug allows HTTP on trusted development networks; release requires HTTPS.
- Dashboard, farms, devices, readings, weather, crop suitability and farm chat.
- Marketplace, vendor/product detail, COD orders, sales and business editing.
- Profile, password, active sessions, security activity and sign-out.
- Encrypted session and account-scoped cloud cache; cached copies show their
  timestamp. Cloud mutations require validated internet and are not auto-retried.
- New screens are awaiting the current GitHub compile/lint/emulator run. The
  earlier successful notebook-only APK is not validation of this screen suite.

## Offline notebook

- Local field notebook: manual pH/NPK entries persist in app-private SQLite,
  without a login or internet connection. Values retain decimal precision.
- Wi-Fi presence and Android-validated internet access are tracked separately.
  Wi-Fi presence does NOT prove an AgriSense device is paired or reachable.
- The local connection screen opens Android Wi-Fi settings; it does not pair a device.
- Records are marked manual/local-only. Their field names are notebook labels,
  not authenticated backend farm IDs. No notebook upload is performed.
- The list shows the newest 100 records; older rows remain in the database.
  App data clearing/uninstallation removes records. Automatic backup is disabled.

## Cloud build

The workflow lives at the workspace root: `.github/workflows/android.yml`.
Publish the workspace as a GitHub repository with `mobile/` at its root; do not
publish environment files, databases, model datasets or credentials. If only
the mobile directory becomes a repository, the workflow must move into that
repository's `.github/workflows` and its paths/working directory must be adjusted.

1. Push the project and workflow to the intended repository.
2. Open Actions > Android Debug APK. Pushes/PRs touching mobile trigger a build;
   Run workflow is also available once the workflow is on the default branch.
3. The hosted runner installs JDK 17, Gradle 8.11.1 and Android SDK 35, runs unit
  tests and Android lint, builds the debug APK, then runs API-isolated Compose
  tests on an API 29 emulator. Screenshots are included in validation reports.
4. Download the `agrisense-debug-<run number>` artifact and unzip it. Transfer
   `app-debug.apk` to an Android phone and allow installation from that source.

Artifacts expire after 14 days. This is a debug APK, not a signed production
release. Hosted runners can generate different debug signing keys across runs;
updates may require uninstalling (which loses local notebook data). Stable private
signing must be configured before using the app for important records.

Gradle is installed at a fixed version by the workflow; there is deliberately no
wrapper JAR or Gradle distribution downloaded on this low-space Mac. A future
local SDK setup can run the same tasks with Gradle 8.11.1.

## Required online/offline architecture

These are requirements, not claims of completed functionality:

- Pair/authenticate a device and read it over local Wi-Fi with no internet.
  Define the firmware protocol first; no device IP, endpoint or credential has
  been assumed. Support device hotspot and shared-router connectivity as agreed
  with firmware. Request Android Wi-Fi permissions only when that feature exists.
- Route device traffic through the selected local Android Network and cloud
  traffic through an internet-capable network where available. Do not globally
  bind every app request to an internet-less IoT network.
- Persist device event IDs, device/farm ownership, source and capture timestamps
  before cloud upload. Preserve simulated versus device versus manual provenance.
- Encrypted account storage and cached reads are implemented. First sign-in needs
  internet; local expiry signs out the account. Revocation is learned on the next
  authenticated server response, not while disconnected. Sign-out clears cloud
  cache but retains the phone-wide notebook. Local removal does not revoke the
  server session; use online sign-out/session management for server revocation.
- Add durable retryable outbox synchronization with backend idempotency. Current
  reading POSTs create new rows each time, so blind retry can duplicate readings.
  Do not transmit unassigned notebook records as authenticated farm readings.
- Keep backend-dependent weather/chat/orders distinct from offline capabilities;
  label cached data and pending operations. Never claim a cloud action succeeded
  before server acknowledgement.
- Add local model runtimes and physical-device tests later. No IoT hardware,
  on-device inference or end-to-end synchronization has been validated yet.

## Verification status

The first GitHub build compiled the Kotlin sources and passed all five JVM tests,
but Android lint blocked APK assembly on two API compatibility errors. Those
uses were removed in commit `9dc3766`. Replacement run `34815346535` passed all
five tests, lint (zero errors, seven non-blocking warnings) and debug APK assembly.
The APK is available as `agrisense-debug-3` in that run's artifacts:
https://github.com/Zyora-Dev/agrisense/actions/runs/34815346535
Phone UI, SQLite persistence and physical Wi-Fi behavior have not been tested.