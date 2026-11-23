#!/usr/bin/env bash
#
# Builds a release copy of the app, signed for development, and installs it
# straight onto an iPhone. The copy carries its own JavaScript, so it runs
# without the bundler.
#
#   TEAM_ID=XXXXXXXXXX ./scripts/install-ios.sh [device]
#
# `ICLOUD=0` leaves out iCloud for settings, for when the team's profile can't
# carry the capability: a free account, or Xcode not signed in to the account.
#
# `TEAM_ID` is your Apple developer team. `device` is a devicectl name or UDID;
# without it the first available iPhone is used. Xcode makes the signing
# profile itself, which registers the app's identifier with the team the first
# time.
set -euo pipefail
cd "$(dirname "$0")/.."

# CocoaPods dies without a UTF-8 locale.
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

fail() { echo "error: $*" >&2; exit 1; }
[ -n "${TEAM_ID:-}" ] || fail "set TEAM_ID to your Apple developer team"

OUT="$PWD/.build"
ARCHIVE="$OUT/Crate.xcarchive"

# The State column is matched from its start: a bare /available/ also matches "unavailable".
DEVICE="${1:-$(xcrun devicectl list devices 2>/dev/null | awk -F '   +' '$5 ~ /iPhone/ && $4 ~ /^available/ {print $3; exit}')}"
[ -n "$DEVICE" ] || fail "no available iPhone found: unlock it or plug it in, or pass a name or UDID"
echo "==> Installing to: $DEVICE"

# ios/ is made again every time, so a change to app.config.ts or a new native module is never
# left out of the build, and nothing an earlier build asked for (an entitlement) lingers.
echo "==> Prebuilding"
rm -rf ios
bunx expo prebuild -p ios --no-install >/dev/null
(cd ios && pod install >/dev/null)

echo "==> Archiving"
xcodebuild archive -workspace ios/Crate.xcworkspace -scheme Crate -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic -allowProvisioningUpdates -quiet

echo "==> Exporting"
rm -rf "$OUT/device"
cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>debugging</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>destination</key><string>export</string>
</dict>
</plist>
PLIST
# System paths first, so Apple's rsync is the one the export finds.
PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH" xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/device" -allowProvisioningUpdates -quiet

IPA="$(ls "$OUT/device"/*.ipa 2>/dev/null | head -1)"
[ -n "$IPA" ] || fail "the export produced no .ipa in $OUT/device"

echo "==> Installing $(basename "$IPA")"
xcrun devicectl device install app --device "$DEVICE" "$IPA" || fail "could not reach $DEVICE: unlock the phone and run this again"
echo "==> Done"
