import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../lib/theme/theme-provider';

import { AppModal } from './app-modal';
import { Button } from './button';
import { Text } from './text';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}

interface ConfirmContextValue {
  /** Resolves `true` on confirm, `false` on cancel or backdrop dismiss. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * A custom-styled replacement for `Alert.alert` (sign-out, cancel-reservation, remove-driver,
 * ...) — `Alert.alert` always renders the OS's own dialog, which can't be reskinned at all, so
 * "restyle every modal" is impossible while any confirmation still goes through it. Same
 * imperative-Promise shape as the site's own confirm dialogs and `useStepUp`'s password prompt,
 * built on the shared `AppModal` shell so it gets the same entrance motion as everything else.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { space } = useTheme();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const finish = useCallback((ok: boolean) => {
    setOptions(null);
    resolveRef.current?.(ok);
    resolveRef.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AppModal visible={!!options} onRequestClose={() => finish(false)}>
        {options ? (
          <>
            <View style={{ gap: space(1) }}>
              <Text variant="h3">{options.title}</Text>
              {options.body ? (
                <Text variant="small" color="mutedForeground">
                  {options.body}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: space(2), justifyContent: 'flex-end' }}>
              <Button variant="ghost" onPress={() => finish(false)}>
                {options.cancelLabel}
              </Button>
              <Button
                variant={options.destructive ? 'destructive' : 'primary'}
                onPress={() => finish(true)}
              >
                {options.confirmLabel}
              </Button>
            </View>
          </>
        ) : null}
      </AppModal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue['confirm'] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx.confirm;
}
