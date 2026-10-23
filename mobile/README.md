# Routinery Android app

This folder contains the Android package for the Routinery web app. It is a **Trusted Web
Activity (TWA)** wrapper around the canonical production site, so the Android app always serves the
same deployed frontend, API, auth, and data as the website.

## Identity

| Field | Value |
| --- | --- |
| App name | Routinery |
| Package ID | `com.advikchaba.routinery` |
| Version | `1.0.1` (version code `2`) |
| Production host | `https://routinery-advik-chaba.vercel.app` |
| Start URL | `/` |
| Minimum Android | API 24 (Android 7.0) |
| Target Android | API 36 |

The TWA opens in Chrome. It does not bundle a copy of the web app, so a normal app update on the
site is visible immediately; publish a new Android build only when the wrapper, icon, package
metadata, or version changes.

## Artifacts

| File | Purpose |
| --- | --- |
| `release/routinery-1.0.1-release.apk` | Signed release APK for direct installation and testing |
| `release/routinery-1.0.1-release.aab` | Signed release bundle to upload to Google Play Console |
| `release/SHA256SUMS.txt` | SHA-256 checksums and signing certificate fingerprint |

Install the APK on a connected device:

```powershell
adb install -r mobile/release/routinery-1.0.1-release.apk
```

The APK is standalone-signed with the upload key in this folder. It is not a debug build.

## Task reminders

Version 1.0.1 adds native task reminders. They are local Android notifications, not web push, so
they work while Routinery is closed and do not need a server scheduler.

How it works:

1. Open Routinery on Android and tap **Sync Android reminders** on the Routine or Profile page.
2. The web app hands the current task titles and `HH:MM` times to the APK through
   `routinery://sync-reminders`.
3. The APK stores the schedule in `SharedPreferences` and schedules one `AlarmManager` alarm per
   task. After a notification fires, the next day's alarm is armed automatically.
4. Rebooting, changing the device time zone, and updating the app re-arm the stored schedule.
   Opening the app also re-arms it after Android force-stops the package.

Android permissions:

- **Notifications** (`POST_NOTIFICATIONS`, Android 13+): requested the first time reminders are
  synced.
- **Alarms & reminders** (`SCHEDULE_EXACT_ALARM`, Android 12+): requested during sync. If it is
  denied, reminders still schedule but Android may delay them; the notification includes a shortcut
  to grant exact timing later.
- **Start at boot** (`RECEIVE_BOOT_COMPLETED`): re-arms reminders after a reboot.

Limitations:

- The native APK cannot read Chrome's task storage. The web page must send the schedule, so tap
  **Sync Android reminders** again after adding, removing, or retiming tasks.
- A task that is completed after the last sync can still produce its reminder. The app has no
  completion channel back into the native alarm.
- Force-stopping the app in Android Settings cancels its alarms. Open Routinery again to re-arm
  them.
- This is an Android-only feature. The web build shows the sync card only on Android.

The native reminder code is under
`mobile/android/app/src/main/java/com/advikchaba/routinery/`:
`ReminderSyncActivity`, `ReminderScheduler`, `ReminderReceiver`, `BootReceiver`,
`NotificationHelper`, `ReminderStore`, and `ReminderTask`.

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
https://routinery-advik-chaba.vercel.app/.well-known/assetlinks.json
```

It currently contains the fingerprint above, so the APK in `release/` opens without a browser
address bar when installed directly.

Google Play App Signing normally re-signs the app with a Play-managed app signing certificate. If
the Play Console uses a different certificate from this upload key, add the Play Console **app
signing certificate** SHA-256 to `frontend/public/.well-known/assetlinks.json`, then redeploy the
frontend. You can also choose to upload this same key as the app signing key during Play Console
setup, in which case the existing file remains correct.

Verify the association with Google:

```text
https://digitalassetlinks.googleapis.com/v1/assetlinks:check?source.web.site=https%3A%2F%2Froutinery-advik-chaba.vercel.app&relation=delegate_permission%2Fcommon.handle_all_urls&target.android_app.package_name=com.advikchaba.routinery&target.android_app.certificate.sha256_fingerprint=E3%3AF5%3A3A%3A1F%3AD7%3A45%3A3E%3A77%3AE2%3A13%3ABA%3A7A%3A29%3AA5%3A00%3AFD%3A0B%3A62%3A08%3AEA%3ABD%3A11%3AA4%3AB6%3A82%3A83%3AB4%3AED%3A07%3A5D%3A29%3A62
```

The response should include `"linked": true`.

## Rebuilding

Prerequisites:

- JDK 17
- Android SDK with platform 36 and build-tools 36.1.0
- Node.js 18+
- Bubblewrap: `npx @bubblewrap/cli`

From `mobile/android`:

```powershell
npx @bubblewrap/cli update --skipVersionUpgrade --manifest twa-manifest.json

$env:BUBBLEWRAP_KEYSTORE_PASSWORD = (Get-Content ..\keystore\CREDENTIALS.txt |
  Where-Object { $_ -like 'storePassword=*' }) -replace '^storePassword=', ''
$env:BUBBLEWRAP_KEY_PASSWORD = (Get-Content ..\keystore\CREDENTIALS.txt |
  Where-Object { $_ -like 'keyPassword=*' }) -replace '^keyPassword=', ''

npx @bubblewrap/cli build
```

Bubblewrap writes the signed outputs to `mobile/android/app-release-signed.apk` and
`mobile/android/app-release-bundle.aab`. Copy them into `mobile/release/` with the versioned names
above.

The checked-in Android source started as a Bubblewrap project, but the reminder feature is a
hand-maintained native layer. **Do not run `bubblewrap update` on this project without re-applying
the reminder files and manifest entries**, because `update` regenerates `AndroidManifest.xml`,
`Application.java`, and `build.gradle`.

`bubblewrap build` checks `twa-manifest.json` against `manifest-checksum.txt` and prompts before
applying manifest changes. If you edit `twa-manifest.json` intentionally, update the checksum to the
SHA-1 of the file first, or run the interactive prompt and then restore the native additions:

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
3. Upload `release/routinery-1.0.1-release.aab` to an internal testing or production track.
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
