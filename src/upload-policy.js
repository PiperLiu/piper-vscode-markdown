'use strict';

const MAX_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 30000;
const PIPER_GAP_MS = 250;
const piperQueues = new Map();

function retryAfterMilliseconds(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  value = value.trim();
  if (/^\d+$/.test(value)) return Math.min(Number.MAX_SAFE_INTEGER, Number(value) * 1000);
  // RFC 9110 HTTP-date includes two obsolete formats. All use UTC, even
  // asctime's format without a GMT suffix. Never treat "1.5" as a date.
  let date;
  const obsolete = /^[A-Za-z]+, (\d{2})-([A-Za-z]{3})-(\d{2}) (\d{2}:\d{2}:\d{2}) GMT$/.exec(value);
  if (obsolete) {
    const currentYear = new Date(now).getUTCFullYear();
    let year = currentYear + (Number(obsolete[3]) - currentYear % 100 + 100) % 100;
    const cutoff = new Date(now); cutoff.setUTCFullYear(currentYear + 50);
    date = Date.parse(`${obsolete[1]} ${obsolete[2]} ${year} ${obsolete[4]} GMT`);
    if (date > cutoff.getTime()) { year -= 100; date = Date.parse(`${obsolete[1]} ${obsolete[2]} ${year} ${obsolete[4]} GMT`); }
  } else if (/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) date = Date.parse(value);
  else if (/^[A-Za-z]{3} [A-Za-z]{3} (?: \d|\d{2}) \d{2}:\d{2}:\d{2} \d{4}$/.test(value)) date = Date.parse(value + ' GMT');
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

function pause(milliseconds, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function waitWithCountdown(milliseconds, signal, onTick) {
  const until = Date.now() + milliseconds;
  let remaining;
  while ((remaining = until - Date.now()) > 0) {
    signal?.throwIfAborted();
    onTick?.(remaining);
    await pause(Math.min(1000, remaining), signal);
  }
  signal?.throwIfAborted();
}

function rateLimitError(delay, attempts) {
  const seconds = Math.ceil(delay / 1000);
  const wait = seconds <= 86400 ? `Wait at least ${seconds} seconds before trying again. / 请至少等待 ${seconds} 秒后重试。` : 'Try again after the server rate-limit window. / 请等待服务端限流窗口结束后重试。';
  const error = new Error(`Image host is busy or rate limited (HTTP 429). ${wait} The clipboard was not changed. / 图床繁忙或上传过于频繁（HTTP 429），剪贴板未修改。`);
  Object.assign(error, { code: 'UPLOAD_RATE_LIMITED', status: 429, retryAfterMs: delay, attempts });
  return error;
}

// Only an explicit 429 is safe to retry here. A network failure or 5xx could
// follow a successful upload, so their result must never be guessed/replayed.
async function requestWithRateLimitRetry(request, signal, onProgress) {
  let retries = 0, waited = 0;
  while (true) {
    signal?.throwIfAborted();
    onProgress?.({ state: 'uploading', attempt: retries + 1, maxAttempts: MAX_RETRIES + 1 });
    const response = await request();
    if (response.status !== 429) return response;
    const requested = retryAfterMilliseconds(response.headers.get('Retry-After'));
    const delay = Math.max(PIPER_GAP_MS, requested ?? 1000 * 2 ** retries);
    try { await response.body?.cancel(); } catch { /* Never publish the error response body. */ }
    signal?.throwIfAborted();
    if (retries >= MAX_RETRIES || delay > MAX_RETRY_WAIT_MS - waited) throw rateLimitError(delay, retries + 1);
    retries++; waited += delay;
    await waitWithCountdown(delay, signal, remaining => {
      const seconds = Math.ceil(remaining / 1000);
      onProgress?.({ state: 'retrying', retry: retries, maxRetries: MAX_RETRIES, retryAfterMs: remaining,
        message: `Rate limited; retry ${retries}/${MAX_RETRIES} in ${seconds}s. / 上传限流，${seconds} 秒后第 ${retries}/${MAX_RETRIES} 次重试。` });
    });
  }
}

// Piper servers may admit only one upload at a time. Share the queue by origin
// (not token/TTL/path), retain FIFO order, and remove cancelled waiters promptly.
function withPiperUploadSlot(origin, signal, work, onProgress) {
  signal?.throwIfAborted();
  let queue = piperQueues.get(origin);
  if (!queue) { queue = { active: false, items: [], nextStart: 0, cleanup: undefined }; piperQueues.set(origin, queue); }
  clearTimeout(queue.cleanup);
  return new Promise((resolve, reject) => {
    const item = { signal, work, onProgress, resolve, reject };
    item.abort = () => {
      const index = queue.items.indexOf(item);
      if (index < 0) return;
      queue.items.splice(index, 1);
      signal.removeEventListener('abort', item.abort);
      reject(signal.reason);
      drain(origin, queue);
    };
    signal?.addEventListener('abort', item.abort, { once: true });
    queue.items.push(item);
    if (queue.active) onProgress?.({ state: 'queued', message: 'Queued behind the current image upload. / 已排队，等待前一张图片上传完成。' });
    drain(origin, queue);
  });
}

function drain(origin, queue) {
  if (queue.active) return;
  clearTimeout(queue.cleanup);
  const item = queue.items.shift();
  if (!item) {
    queue.cleanup = setTimeout(() => { if (!queue.active && !queue.items.length && piperQueues.get(origin) === queue) piperQueues.delete(origin); }, Math.max(0, queue.nextStart - Date.now()));
    queue.cleanup.unref?.();
    return;
  }
  queue.active = true;
  item.signal?.removeEventListener('abort', item.abort);
  Promise.resolve().then(async () => {
    item.signal?.throwIfAborted();
    await waitWithCountdown(Math.max(0, queue.nextStart - Date.now()), item.signal, remaining => item.onProgress?.({ state: 'pacing', retryAfterMs: remaining, message: 'Brief pause between image uploads. / 正在按图床上传间隔发送。' }));
    return item.work();
  }).then(item.resolve, item.reject).finally(() => {
    queue.active = false;
    queue.nextStart = Date.now() + PIPER_GAP_MS;
    drain(origin, queue);
  });
}

module.exports = { retryAfterMilliseconds, requestWithRateLimitRetry, withPiperUploadSlot };
