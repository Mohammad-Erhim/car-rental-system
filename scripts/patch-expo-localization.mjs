#!/usr/bin/env node
// Expo SDK 51 packages need a couple of iOS 26 SDK compatibility patches. No newer stable
// releases exist in the SDK 51 line for these fixes (only unvetted canary builds), so this
// patches the vendored source in place on every install. Idempotent: no-ops if the fix is
// already applied or the file is missing (e.g. package not installed, or a future version
// already handles this).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const localizationTarget = path.join(
  root,
  'apps/mobile/node_modules/expo-localization/ios/LocalizationModule.swift',
);
const deviceTarget = path.join(root, 'apps/mobile/node_modules/expo-device/ios/UIDevice.swift');

function patchExpoLocalization() {
  if (!existsSync(localizationTarget)) {
    return;
  }

  const original = readFileSync(localizationTarget, 'utf8');
  if (original.includes('@unknown default:')) {
    return;
  }

  const needle = '    case .iso8601:\n      return "iso8601"\n    }\n  }';
  const replacement =
    '    case .iso8601:\n      return "iso8601"\n    @unknown default:\n      return "gregory"\n    }\n  }';

  if (!original.includes(needle)) {
    console.warn(
      '[patch-expo-localization] expected switch statement not found - skipping (package may have changed upstream).',
    );
    return;
  }

  writeFileSync(localizationTarget, original.replace(needle, replacement));
  console.log(
    '[patch-expo-localization] patched Calendar.Identifier switch for iOS 26 SDK compat.',
  );
}

function patchExpoDevice() {
  if (!existsSync(deviceTarget)) {
    return;
  }

  const original = readFileSync(deviceTarget, 'utf8');
  if (original.includes('#if targetEnvironment(simulator)')) {
    return;
  }

  const needle = '  var isSimulator: Bool {\n    return TARGET_OS_SIMULATOR != 0\n  }';
  const replacement =
    '  var isSimulator: Bool {\n#if targetEnvironment(simulator)\n    return true\n#else\n    return false\n#endif\n  }';

  if (!original.includes(needle)) {
    console.warn(
      '[patch-expo-device] expected simulator check not found - skipping (package may have changed upstream).',
    );
    return;
  }

  writeFileSync(deviceTarget, original.replace(needle, replacement));
  console.log('[patch-expo-device] patched simulator check for iOS 26 SDK compat.');
}

patchExpoLocalization();
patchExpoDevice();
