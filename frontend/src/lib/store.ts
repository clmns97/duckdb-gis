// Change notification for the module-level stores (layers, selection, editing,
// …): `subscribe` + `emit`, and a `version` scalar bumped on every change — the
// cheap snapshot React's `useSyncExternalStore` compares, and a deck.gl
// `updateTriggers` value.
export function changeSignal() {
  const listeners = new Set<() => void>();
  let version = 0;
  return {
    get version(): number {
      return version;
    },
    subscribe(l: () => void): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    emit(): void {
      version += 1;
      listeners.forEach((l) => l());
    },
  };
}
