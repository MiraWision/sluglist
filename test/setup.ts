/**
 * Test-environment repair, not product code.
 *
 * Node >= 25 defines its own `globalThis.localStorage` (an empty, null-prototype
 * stub unless the process was started with a valid `--localstorage-file`). That
 * property already exists when vitest installs the jsdom globals, so jsdom's own
 * `Storage` never lands and every test touching `localStorage` fails with
 * "localStorage.clear is not a function". CI runs Node 20 and never sees it.
 *
 * When the ambient `localStorage` is not a usable Storage, install a minimal
 * in-memory one with the same surface. jsdom's own implementation (older Node)
 * is left untouched.
 */
function usable(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Storage).clear === "function" &&
    typeof (value as Storage).setItem === "function"
  );
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(String(key)) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(String(key));
    },
    setItem: (key: string, value: string) => {
      map.set(String(key), String(value));
    },
  } as Storage;
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  const current = (globalThis as Record<string, unknown>)[name];
  if (!usable(current)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: memoryStorage(),
    });
  }
}
