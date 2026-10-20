/** A bounded metadata-only search. Candidate selection remains in source order. */
export function startSearch(load, parentSignal, limit = 10) {
  const controller = new AbortController();
  const signal = AbortSignal.any([parentSignal, controller.signal].filter(Boolean));
  const queue = []; let received = 0, done = false, failure = null, wake = null;
  const notify = () => { wake?.(); wake = null; };
  signal.addEventListener('abort', notify, { once: true });
  const emit = entry => {
    if (!entry || signal.aborted || received >= limit) return;
    received++; queue.push(entry); notify();
  };
  const settled = Promise.resolve().then(() => {
    signal.throwIfAborted(); return load(signal, emit);
  }).then(result => {
    if (!result?.streamed) for (const entry of result?.entries || [result]) emit(entry);
  }).catch(error => { failure = error; }).finally(() => { done = true; notify(); signal.removeEventListener('abort', notify); });
  return {
    get failed() { return Boolean(failure); },
    cancel() { controller.abort(); }, settled,
    async *entries() {
      while (true) {
        signal.throwIfAborted();
        if (queue.length) { yield queue.shift(); continue; }
        if (done) { if (failure) throw failure; return; }
        await new Promise(resolve => { wake = resolve; });
      }
    },
  };
}
