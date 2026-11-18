/**
 * Timeout helper: combines an optional caller signal with a hard deadline
 * using AbortSignal.any when available (Node >= 20), with a manual fallback.
 */

export interface TimeoutHandle {
  signal: AbortSignal;
  /** True when the deadline fired (as opposed to caller cancellation). */
  didTimeout: () => boolean;
  dispose: () => void;
}

export function createTimeoutSignal(timeoutMs: number, parent?: AbortSignal): TimeoutHandle {
  const controller = new AbortController();
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;

  const abortParent = (): void => {
    if (!controller.signal.aborted) controller.abort();
  };

  if (parent) {
    if (parent.aborted) {
      controller.abort();
    } else {
      parent.addEventListener('abort', abortParent, { once: true });
    }
  }

  if (timeoutMs > 0 && !controller.signal.aborted) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    // Don't keep the process alive just for a timeout timer.
    (timer as unknown as { unref?: () => void }).unref?.();
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      if (timer) clearTimeout(timer);
      parent?.removeEventListener('abort', abortParent);
    },
  };
}

/** Resolve after `ms`, rejecting when the signal aborts. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createAbortError(message = 'Operation cancelled.'): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = 'ABORT_ERR';
  return error;
}

export function isAbortError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const name = (error as { name?: string })?.name;
  return code === 'ABORT_ERR' || name === 'AbortError';
}
