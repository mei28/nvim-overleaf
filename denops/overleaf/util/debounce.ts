// Debounce utility for OT flush timing.

export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delayMs: number,
): T & { cancel: () => void } {
  let timer: number | undefined;

  const debounced = ((...args: Parameters<T>) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delayMs);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return debounced;
}
