export type PublishingProgress = {
  value: number;
  phase: string;
  detail: string;
  completed?: number;
  total?: number;
  state?: string;
  retry?: number;
  maxRetries?: number;
  retryAfterMs?: number;
};
const stages: Record<string, [number, number]> = {
  parse: [0, 0.08],
  convert: [0.08, 0.62],
  upload: [0.62, 0.92],
  style: [0.92, 0.97],
  clipboard: [0.97, 1],
};
export function initialPublishingProgress(): PublishingProgress {
  return { value: 0, phase: 'parse', detail: '' };
}
export function advancePublishingProgress(
  previous: PublishingProgress,
  event: unknown,
): PublishingProgress {
  if (typeof event === 'string') return { ...previous, detail: event };
  if (!event || typeof event !== 'object') return previous;
  const input = event as Record<string, unknown>;
  const phase = typeof input.phase === 'string' ? input.phase : previous.phase;
  const stage = stages[phase];
  if (!stage || stage[0] < stages[previous.phase][0]) return previous;
  const validCount =
    typeof input.completed === 'number' &&
    Number.isFinite(input.completed) &&
    input.completed >= 0 &&
    typeof input.total === 'number' &&
    Number.isFinite(input.total) &&
    input.total >= 0;
  const completed = validCount
    ? Math.min(input.completed as number, input.total as number)
    : undefined;
  const total = validCount ? (input.total as number) : undefined;
  // Waiting/detail-only events must not pretend the upload phase is complete.
  const value = validCount
    ? stage[0] + (stage[1] - stage[0]) * (total! > 0 ? completed! / total! : 0)
    : previous.value;
  return {
    value: Math.max(previous.value, value),
    phase,
    detail: typeof input.message === 'string' ? input.message : '',
    completed:
      completed ?? (phase === previous.phase ? previous.completed : undefined),
    total: total ?? (phase === previous.phase ? previous.total : undefined),
    state: typeof input.state === 'string' ? input.state : undefined,
    retry: typeof input.retry === 'number' ? input.retry : undefined,
    maxRetries:
      typeof input.maxRetries === 'number' ? input.maxRetries : undefined,
    retryAfterMs:
      typeof input.retryAfterMs === 'number' ? input.retryAfterMs : undefined,
  };
}
export function publishingProgressDetail(
  progress: PublishingProgress,
  locale: string,
): string {
  const zh = /^zh/i.test(locale);
  const hasCount =
    progress.total !== undefined &&
    progress.total > 0 &&
    progress.completed !== undefined;
  const count = hasCount
    ? zh
      ? `已上传 ${progress.completed}/${progress.total} 张`
      : `${progress.completed}/${progress.total} images uploaded`
    : '';
  const join = (message: string) => (count ? `${count} · ${message}` : message);
  if (progress.phase === 'upload') {
    if (
      progress.state === 'retrying' &&
      Number.isFinite(progress.retryAfterMs) &&
      progress.retryAfterMs! >= 0
    ) {
      const seconds = Math.ceil(progress.retryAfterMs! / 1000);
      const attempt =
        Number.isSafeInteger(progress.retry) &&
        Number.isSafeInteger(progress.maxRetries)
          ? ` (${progress.retry}/${progress.maxRetries})`
          : '';
      return join(
        zh
          ? `图床繁忙，${seconds} 秒后重试${attempt}`
          : `Host busy; retrying in ${seconds}s${attempt}`,
      );
    }
    if (progress.state === 'queued')
      return join(
        zh ? '等待前一张图片上传完成' : 'Waiting for the previous image upload',
      );
    if (progress.state === 'pacing')
      return join(
        zh ? '正在按图床上传间隔发送' : 'Pausing briefly between uploads',
      );
    if (progress.state === 'uploading' && hasCount)
      return zh
        ? `正在上传第 ${Math.min(progress.completed! + 1, progress.total!)}/${progress.total} 张`
        : `Uploading image ${Math.min(progress.completed! + 1, progress.total!)}/${progress.total}`;
    return progress.detail || count;
  }
  return progress.detail;
}
