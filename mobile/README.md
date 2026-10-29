# DayGuide Android app

This folder contains the Android package for the DayGuide web app. It is a **Trusted Web
Activity (TWA)** wrapper around the canonical production site, so the Android app always serves the
same deployed frontend, API, auth, and data as the website.

## Identity

| Field | Value |
| --- | --- |
| App name | DayGuide |
| Package ID | `com.advikchaba.routinery` |
| Version | `1.0.4` (version code `5`) |
| Production host | `https://dayguide-advik-chaba.vercel.app` |
| Start URL | `/` |
| Minimum Android | API 24 (Android 7.0) |
| Target Android | API 36 |

The TWA opens in Chrome. It does not bundle a copy of the web app, so a normal app update on the
site is visible immediately; publish a new Android build only when the wrapper, icon, package
metadata, or version changes.

The package ID, keystore alias, and `routinery://sync-reminders` bridge keep their original names
so existing installs can update and continue syncing reminders. The user-facing app name, launcher
label, icon, splash screen, and web host are DayGuide.

## Artifacts

The current signed build is `release/dayguide-1.0.4-*`. Version `1.0.4` adds the post-sign-in
notification prompt, sequential task unlocking, the browser reminder scheduler, and a web Fullscreen
API fallback for devices where Chrome ignores the TWA immersive flag. The older
`release/dayguide-1.0.3-*` and `release/routinery-1.0.1-*` files are kept for reference.

| File | Purpose |
| --- | --- |
| `release/dayguide-1.0.4-release.apk` | Signed release APK for direct installation and testing |
| `release/dayguide-1.0.4-release.aab` | Signed release bundle to upload to Google Play Console |
| `release/dayguide-1.0.3-release.apk` | Previous signed build, kept for reference |
| `release/dayguide-1.0.3-release.aab` | Previous signed bundle, kept for reference |
| `release/routinery-1.0.1-release.apk` | Older signed build, kept for reference |
| `release/routinery-1.0.1-release.aab` | Older signed bundle, kept for reference |
| `release/SHA256SUMS.txt` | SHA-256 checksums and signing certificate fingerprint |

Install the current APK on a connected device:

```powershell
adb install -r mobile/release/dayguide-1.0.4-release.apk
```

The APK is standalone-signed with the upload key in this folder. It is not a debug build.

## Task reminders

DayGuide asks for notification permission after sign-in (or on the first visit for an existing
account). There are two delivery paths:

- **Website:** the browser scheduler shows a notification at each task's scheduled time while the
  DayGuide page is open. A minimal service worker (`frontend/public/sw.js`) displays the notification
  and focuses/opens `/app` when it is clicked. This path does not use web push.
- **Android app:** the APK uses native `AlarmManager` alarms, so reminders keep working when the app
  is closed. The web page hands the schedule to the APK through `routinery://sync-reminders`.

The setup prompt opens automatically once per account and platform:

1. Sign in or create an account. The notification modal appears after the profile loads.
2. Tap **Enable notifications** on the website, or **Open Android setup** in the Android app.
3. On Android, `ReminderSyncActivity` requests `POST_NOTIFICATIONS` and opens the Alarms & reminders
   settings page for `SCHEDULE_EXACT_ALARM`, then stores the schedule.
4. The **Task reminders** card on Routine and Profile shows the current status, a browser test
   button, and a manual **Sync Android reminders** button.

The native schedule is local, not web push:

1. The web app sends the current task titles and `HH:MM` times to the APK through
   `routinery://sync-reminders`.
2. The APK stores the schedule in `SharedPreferences` and schedules one `AlarmManager` alarm per
   task. After a notification fires, the next day's alarm is armed automatically.
3. Rebooting, changing the device time zone, and updating the app re-arm the stored schedule.
   Opening the app also re-arms it after Android force-stops the package.

Android permissions:

- **Notifications** (`POST_NOTIFICATIONS`, Android 13+): requested when Android setup is opened.
- **Alarms & reminders** (`SCHEDULE_EXACT_ALARM`, Android 12+): requested during setup. If it is
  denied, reminders still schedule but Android may delay them; the notification includes a shortcut
  to grant exact timing later.
- **Start at boot** (`RECEIVE_BOOT_COMPLETED`): re-arms reminders after a reboot.

Limitations:

- Browser reminders require the website to stay open. Delivering a notification after the browser is
  fully closed would require web push plus a server-side scheduler and is intentionally not included.
- The native APK cannot read Chrome's task storage. The web page must send the schedule, so tap
  **Sync Android reminders** again after adding, removing, or retiming tasks. The card shows a
  **Sync needed after schedule changes** badge when the stored fingerprint is stale.
- A task that is completed after the last native sync can still produce its reminder. The app has no
  completion channel back into the native alarm.
- Force-stopping the app in Android Settings cancels its alarms. Open DayGuide again to re-arm
  them.
- If native Android reminders are configured, the web scheduler skips duplicate browser alerts on
  that device.

The native reminder code is under
`mobile/android/app/src/main/java/com/advikchaba/routinery/`:
`ReminderSyncActivity`, `ReminderScheduler`, `ReminderReceiver`, `BootReceiver`,
`NotificationHelper`, `ReminderStore`, and `ReminderTask`.

## Fullscreen and security

Version `1.0.4` launches the Trusted Web Activity in Android immersive fullscreen:

- `twa-manifest.json` uses `"display": "fullscreen"`.
- `LauncherActivity` has the `android.support.customtabs.trusted.DISPLAY_MODE` metadata set to
  `immersive`.
- The splash uses the fullscreen `LaunchTheme`.
- The web manifest, the bundled ChromeOS/Meta Quest copy, and `display_override` all request
  `fullscreen` with `standalone` as a fallback.
- If Chrome still shows browser or system bars, `frontend/src/lib/fullscreen.ts` enters the
  Fullscreen API on the first tap. This is a fallback; the TWA immersive flag is the primary path.

The Android wrapper is hardened as follows:

- The TWA is bound to the canonical `https://dayguide-advik-chaba.vercel.app` origin with Digital
  Asset Links and starts at that origin with the browser-less UI.
- Cleartext traffic is disabled in both the manifest and `res/xml/network_security_config.xml`.
  The wrapper's own network policy trusts only system certificate anchors; the page content itself is
  rendered by Chrome, so it inherits Chrome's HTTPS and certificate handling.
- Android backup and full-backup participation are disabled, and `data_extraction_rules.xml`
  explicitly excludes every app-data domain from Android 12+ cloud backup and D2D transfer. The
  synced reminder schedule and app preferences are therefore not copied to another device.
- The FileProvider, notification delegation service, FocusActivity, and WebView fallback are not
  exported. `BootReceiver` is exported only for the protected system boot/time broadcasts.
- `ReminderSyncActivity` is the one intentionally exported component because Chrome must launch it
  through `routinery://sync-reminders`. It requires an exact scheme/host match, caps the payload at
  100 KB and 200 tasks, validates task ids/titles/times, and uses immutable PendingIntents for its
  alarms and notifications.
- The fallback is `customtabs` (Chrome), not an embedded WebView.

## Signing key

The signing material is local and intentionally excluded from git:

- Keystore: `mobile/keystore/routinery-upload.jks`
- Alias: `routinery`
- Credentials: `mobile/keystore/CREDENTIALS.txt`

Back up **both files**. If the keystore is lost, you cannot publish updates to an app that was
already released under this package with the same signing key. Do not post or commit the keystore or
its password.

Certificate SHA-256:

```text
E3:F5:3A:1F:D7:45:3E:77:E2:13:BA:7A:29:A5:00:FD:0B:62:08:EA:BD:11:A4:B6:82:83:B4:ED:07:5D:29:62
```

## Digital Asset Links

The TWA association file is deployed at:

```text
https://dayguide-advik-chaba.vercel.app/.well-known/assetlinks.json
```

It currently contains the fingerprint above, so a build targeting the new host opens without a
browser address bar when installed directly. Install `release/dayguide-1.0.4-release.apk` before
testing the browser-less TWA experience; the older artifacts still target the previous host or lack
the new notification behavior.

Google Play App Signing normally re-signs the app with a Play-managed app signing certificate. If
the Play Console uses a different certificate from this upload key, add the Play Console **app
signing certificate** SHA-256 to `frontend/public/.well-known/assetlinks.json`, then redeploy the
frontend. You can also choose to upload this same key as the app signing key during Play Console
setup, in which case the existing file remains correct.

Verify the association with Google:

```text
https://digitalassetlinks.googleapis.com/v1/assetlinks:check?source.web.site=https%3A%2F%2Fdayguide-advik-chaba.vercel.app&relation=delegate_permission%2Fcommon.handle_all_urls&target.android_app.package_name=com.advikchaba.routinery&target.android_app.certificate.sha256_fingerprint=E3%3AF5%3A3A%3A1F%3AD7%3A45%3A3E%3A77%3AE2%3A13%3ABA%3A7A%3A29%3AA5%3A00%3AFD%3A0B%3A62%3A08%3AEA%3ABD%3A11%3AA4%3AB6%3A82%3A83%3AB4%3AED%3A07%3A5D%3A29%3A62
```

The response should include `"linked": true`.

## Rebuilding

Prerequisites:

- JDK 17
- Android SDK with platform 36 and build-tools 36.1.0
- Node.js 18+
- Bubblewrap is not required for normal builds; this project is built directly from the
  hand-maintained Gradle project.

From `mobile/android`:

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-17'
$env:ANDROID_HOME = 'C:\path\to\android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

.\gradlew.bat assembleRelease bundleRelease --no-daemon
```

Gradle writes the unsigned APK and bundle here:

- `app/build/outputs/apk/release/app-release-unsigned.apk`
- `app/build/outputs/bundle/release/app-release.aab`

Sign both with the upload key, using the passwords from the local-only credentials file:

```powershell
$storePass = (Get-Content ..\keystore\CREDENTIALS.txt |
  Where-Object { $_ -like 'storePassword=*' } |
  Select-Object -First 1) -replace '^storePassword=', ''
$keyPass = (Get-Content ..\keystore\CREDENTIALS.txt |
  Where-Object { $_ -like 'keyPassword=*' } |
  Select-Object -First 1) -replace '^keyPassword=', ''

& "$env:ANDROID_HOME\build-tools\36.1.0\apksigner.bat" sign `
  --ks ..\keystore\routinery-upload.jks --ks-key-alias routinery `
  --ks-pass "pass:$storePass" --key-pass "pass:$keyPass" `
  --out ..\release\dayguide-1.0.4-release.apk `
  app\build\outputs\apk\release\app-release-unsigned.apk

& "$env:JAVA_HOME\bin\jarsigner.exe" `
  -keystore ..\keystore\routinery-upload.jks `
  -storepass $storePass -keypass $keyPass `
  -sigalg SHA256withRSA -digestalg SHA-256 `
  -signedjar ..\release\dayguide-1.0.4-release.aab `
  app\build\outputs\bundle\release\app-release.aab routinery
```

Verify the package/version and certificate before publishing:

```powershell
& "$env:ANDROID_HOME\build-tools\36.1.0\apksigner.bat" verify --print-certs `
  ..\release\dayguide-1.0.4-release.apk

& "$env:ANDROID_HOME\build-tools\36.1.0\aapt2.exe" dump badging `
  ..\release\dayguide-1.0.4-release.apk |
  Select-String 'package:|application-label:'
```

The checked-in Android source started as a Bubblewrap project, but the reminder feature and the
security hardening are hand-maintained native layers. **Do not run `bubblewrap update` on this
project without re-applying the reminder files and manifest entries.** `update` regenerates
`AndroidManifest.xml`, `Application.java`, and `build.gradle`, which would remove the fullscreen
metadata, backup/network hardening, exported-component flags, and reminder bridge. Build directly
from the checked-in project instead.

`bubblewrap`/the TWA tooling may check `twa-manifest.json` against `manifest-checksum.txt`. If you
edit `twa-manifest.json` intentionally, update the checksum to the SHA-1 of the file:

```powershell
$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path twa-manifest.json))
$sha1 = [System.Security.Cryptography.SHA1]::Create().ComputeHash($bytes)
$hex = ($sha1 | ForEach-Object { $_.ToString('x2') }) -join ''
Set-Content manifest-checksum.txt -Value $hex -NoNewline
```

Do not hand-edit generated files unless you also expect a later `update` to overwrite them.

One intentional post-generation tweak is the dark adaptive-icon background in
`app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` (using `@color/icon_background`). Bubblewrap's
template uses a white base there, which would put a light ring around the dark app icon. Restore that
one line if `update` regenerates it.

## Publishing to Google Play

1. Create the app in [Google Play Console](https://play.google.com/console) with package name
   `com.advikchaba.routinery`.
2. Enroll in Play App Signing. Either use the existing upload key as the app signing key, or note the
   Play-managed app signing certificate and update the Digital Asset Links fingerprint.
3. Upload `release/dayguide-1.0.4-release.aab` (or the previous bundle while testing) to an internal
   testing or production track.
4. Complete the store listing: app name, short and full description, phone screenshots, a 512x512
   icon, and a 1024x500 feature graphic.
5. Add a privacy policy URL and complete the Data safety form. The app handles account email,
   username, profile picture, routine/task history, coins/ELO, and leaderboard data through
   Supabase.
6. Complete content rating, target audience, and ads declarations. The app currently has no ads and
   no in-app purchases.
7. Roll out to internal testing first, install the Play-signed build, and confirm the app opens
   full-screen without a browser address bar.

The APK in `release/` is useful for quick device testing, but the **AAB is the Play Store upload
artifact**. New apps cannot be published with an APK alone.
