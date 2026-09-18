#!/usr/bin/env node
// `@stripe/stripe-react-native@0.38.6`'s `CardFieldManager` (iOS) force-unwraps the field's view
// from the UIManager's view registry on every focus/blur/clear command:
//   let view: CardFieldView = (viewRegistry![reactTag] as? CardFieldView)!
// `blur()` is called from the JS side's unmount cleanup whenever the field still has focus (see
// `CardField.tsx`'s `useLayoutEffect` teardown) — e.g. the user taps the card field, then taps
// back. That command reaches native *after* the view has already been torn down by the navigator,
// so `viewRegistry![reactTag]` is nil and the forced unwrap crashes
// ("Swift runtime failure: force unwrapped a nil value", inside `CardFieldManager.blur(_:)`).
// No newer stable release exists in the RN 0.74/Expo 51 compatibility range that fixes this, so
// this patches the vendored source in place on every install. Idempotent: no-ops if the fix is
// already applied or the file is missing.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(
  root,
  'apps/mobile/node_modules/@stripe/stripe-react-native/ios/CardFieldManager.swift',
);

const COMMANDS = ['focus', 'blur', 'clear'];

function patchStripeCardField() {
  if (!existsSync(target)) {
    return;
  }

  let source = readFileSync(target, 'utf8');
  let patchedCount = 0;

  for (const command of COMMANDS) {
    const needle =
      `    @objc func ${command}(_ reactTag: NSNumber) {\n` +
      `        self.bridge!.uiManager.addUIBlock { (_: RCTUIManager?, viewRegistry: [NSNumber: UIView]?) in\n` +
      `            let view: CardFieldView = (viewRegistry![reactTag] as? CardFieldView)!\n` +
      `            view.${command}()\n` +
      `        }\n` +
      `    }`;
    const replacement =
      `    @objc func ${command}(_ reactTag: NSNumber) {\n` +
      `        self.bridge!.uiManager.addUIBlock { (_: RCTUIManager?, viewRegistry: [NSNumber: UIView]?) in\n` +
      `            guard let view = viewRegistry?[reactTag] as? CardFieldView else { return }\n` +
      `            view.${command}()\n` +
      `        }\n` +
      `    }`;

    if (source.includes(replacement)) {
      patchedCount += 1;
      continue;
    }
    if (!source.includes(needle)) {
      console.warn(
        `[patch-stripe-cardfield] expected ${command}(_:) body not found - skipping (package may have changed upstream).`,
      );
      continue;
    }
    source = source.replace(needle, replacement);
    patchedCount += 1;
  }

  if (patchedCount === COMMANDS.length) {
    writeFileSync(target, source);
    console.log(
      '[patch-stripe-cardfield] patched CardFieldManager focus/blur/clear to no-op instead of crashing when the view is already unmounted.',
    );
  }
}

patchStripeCardField();
