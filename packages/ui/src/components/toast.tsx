import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { cn } from '../lib/utils.js';

/**
 * Toast for non-critical short confirmations only (design §12.5 rule 4). It is never the sole
 * evidence for money / cancellation / booking / custody / access — those use a confirmation view.
 */
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant?: 'default' | 'success';
}
interface ToastCtx {
  toast: (t: Omit<ToastItem, 'id'>) => void;
}
const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 5000);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {items.map((i) => (
          <ToastPrimitive.Root
            key={i.id}
            className={cn(
              'pointer-events-auto flex w-[22rem] max-w-[90vw] items-start gap-3 rounded-md border bg-background p-4 shadow-lg',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out',
            )}
          >
            {i.variant === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            ) : null}
            <div className="flex-1">
              <ToastPrimitive.Title className="text-sm font-medium">{i.title}</ToastPrimitive.Title>
              {i.description ? (
                <ToastPrimitive.Description className="text-sm text-muted-foreground">
                  {i.description}
                </ToastPrimitive.Description>
              ) : null}
            </div>
            <ToastPrimitive.Close aria-label="Dismiss" className="opacity-60 hover:opacity-100">
              <X className="size-4" aria-hidden="true" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 end-4 z-[100] flex flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
