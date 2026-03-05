export interface VideoTrackingEndpoints {
  start?: string;
  q1?: string;
  q2?: string;
  q3?: string;
  complete?: string;
  mute?: string;
  unmute?: string;
  replay?: string;
  ttff?: string;
  duration?: string;
  autoplay_fail?: string;
}

export type VideoTrackingParamValue = string | number | boolean | null | undefined;

export interface AdworksVideoTrackingConfig {
  enabled?: boolean;
  videoSelector?: string;
  creativeId?: string;
  cacheBust?: boolean;
  endpoints?: VideoTrackingEndpoints;
  extraParams?: Record<string, VideoTrackingParamValue>;
  attemptAutoplay?: boolean;
  autoplayTimeoutMs?: number;
}

export const DEFAULT_VIDEO_TRACKING_ENDPOINTS: Readonly<Required<VideoTrackingEndpoints>> = {
  start: 'https://tracker/pixel?e=start',
  q1: 'https://tracker/pixel?e=25',
  q2: 'https://tracker/pixel?e=50',
  q3: 'https://tracker/pixel?e=75',
  complete: 'https://tracker/pixel?e=100',
  mute: 'https://tracker/pixel?e=mute',
  unmute: 'https://tracker/pixel?e=unmute',
  replay: 'https://tracker/pixel?e=replay',
  ttff: 'https://tracker/pixel?e=ttff',
  duration: 'https://tracker/pixel?e=duration',
  autoplay_fail: 'https://tracker/pixel?e=autoplay_fail',
};

export function createDefaultVideoTrackingConfig(creativeId: string): AdworksVideoTrackingConfig {
  return {
    enabled: true,
    videoSelector: '#video',
    creativeId,
    cacheBust: true,
    endpoints: { ...DEFAULT_VIDEO_TRACKING_ENDPOINTS },
    extraParams: {},
    attemptAutoplay: true,
    autoplayTimeoutMs: 2_000,
  };
}

export function buildVideoTrackingConfigAssignment(config: AdworksVideoTrackingConfig): string {
  const json = JSON.stringify(config, null, 2).replace(/<\//g, '<\\/');
  return `window.__ADWORKS_VIDEO_TRACKING__ = ${json};`;
}

export function buildVideoTrackingJs(): string {
  return `;(${initAdworksVideoTracking.toString()})(window);\n`;
}

export function initAdworksVideoTracking(root: unknown): void {
  const globalObj = (root ?? (typeof window !== 'undefined' ? window : undefined)) as Record<string, unknown> | undefined;
  if (!globalObj) {
    return;
  }

  const documentRef = (globalObj.document ?? null) as Document | null;
  if (!documentRef || typeof documentRef.querySelector !== 'function') {
    return;
  }

  const rawConfig = (globalObj.__ADWORKS_VIDEO_TRACKING__ ?? null) as AdworksVideoTrackingConfig | null;
  if (!rawConfig || typeof rawConfig !== 'object' || rawConfig.enabled === false) {
    return;
  }

  const selector = typeof rawConfig.videoSelector === 'string' && rawConfig.videoSelector.trim().length > 0
    ? rawConfig.videoSelector.trim()
    : 'video';

  const video = documentRef.querySelector(selector) as HTMLVideoElement | null;
  if (!video) {
    return;
  }

  const endpoints = rawConfig.endpoints && typeof rawConfig.endpoints === 'object'
    ? rawConfig.endpoints
    : {};
  const extraParams = rawConfig.extraParams && typeof rawConfig.extraParams === 'object'
    ? rawConfig.extraParams
    : {};
  const creativeId = typeof rawConfig.creativeId === 'string' && rawConfig.creativeId.trim().length > 0
    ? rawConfig.creativeId.trim()
    : '';
  const cacheBust = rawConfig.cacheBust !== false;
  const autoplayTimeoutMs = typeof rawConfig.autoplayTimeoutMs === 'number' && rawConfig.autoplayTimeoutMs > 0
    ? rawConfig.autoplayTimeoutMs
    : 2_000;

  const fired = {
    start: false,
    q1: false,
    q2: false,
    q3: false,
    complete: false,
    duration: false,
    ttff: false,
    autoplay_fail: false,
  };
  let durationMs: number | null = null;
  let queuedQuartileCheck = false;
  let endedSeen = false;
  let replayCount = 0;
  let previousMutedState = isMuted();
  let userInteracted = false;
  let autoplayAttemptToken = 0;

  const durationQueue: Array<() => void> = [];
  const startTsMs = now();

  if (typeof globalObj.addEventListener === 'function') {
    const markUserInteraction = (): void => {
      userInteracted = true;
    };
    globalObj.addEventListener('pointerdown', markUserInteraction);
    globalObj.addEventListener('keydown', markUserInteraction);
    globalObj.addEventListener('touchstart', markUserInteraction);
  }

  const onLoadedMetadata = (): void => {
    updateDuration();
  };
  const onDurationChange = (): void => {
    updateDuration();
  };
  const onPlaying = (): void => {
    if (!fired.start) {
      fired.start = true;
      send('start');
    }
    if (!fired.ttff) {
      fired.ttff = true;
      send('ttff', { ttffMs: Math.max(0, now() - startTsMs) });
    }
    if (endedSeen) {
      replayCount += 1;
      endedSeen = false;
      send('replay', { replayCount });
    }
    requestQuartileCheck();
  };
  const onTimeUpdate = (): void => {
    requestQuartileCheck();
  };
  const onEnded = (): void => {
    endedSeen = true;
    fireComplete('ended');
  };
  const onVolumeChange = (): void => {
    const nextMutedState = isMuted();
    if (nextMutedState === previousMutedState) {
      return;
    }
    previousMutedState = nextMutedState;
    send(nextMutedState ? 'mute' : 'unmute');
  };

  video.addEventListener('loadedmetadata', onLoadedMetadata);
  video.addEventListener('durationchange', onDurationChange);
  video.addEventListener('playing', onPlaying);
  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('ended', onEnded);
  video.addEventListener('volumechange', onVolumeChange);

  updateDuration();
  requestQuartileCheck();
  tryAutoplay();

  function now(): number {
    if (globalObj.Date && typeof (globalObj.Date as DateConstructor).now === 'function') {
      return (globalObj.Date as DateConstructor).now();
    }
    return Date.now();
  }

  function getCurrentTimeMs(): number | null {
    if (!Number.isFinite(video.currentTime) || video.currentTime < 0) {
      return null;
    }
    return Math.round(video.currentTime * 1_000);
  }

  function getDurationMsFromVideo(): number | null {
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration === Infinity) {
      return null;
    }
    return Math.round(video.duration * 1_000);
  }

  function updateDuration(): void {
    const nextDurationMs = getDurationMsFromVideo();
    if (nextDurationMs === null) {
      return;
    }
    durationMs = nextDurationMs;
    if (!fired.duration) {
      fired.duration = true;
      send('duration', { videoDurationMs: durationMs });
    }
    flushDurationQueue();
  }

  function requestQuartileCheck(): void {
    if (durationMs === null) {
      if (!queuedQuartileCheck) {
        queuedQuartileCheck = true;
        durationQueue.push(() => {
          queuedQuartileCheck = false;
          evaluateQuartiles();
        });
      }
      return;
    }
    evaluateQuartiles();
  }

  function flushDurationQueue(): void {
    if (durationMs === null || durationQueue.length === 0) {
      return;
    }
    const pending = durationQueue.splice(0, durationQueue.length);
    for (const task of pending) {
      try {
        task();
      } catch {
        // Tracking must never throw.
      }
    }
  }

  function evaluateQuartiles(): void {
    if (durationMs === null || durationMs <= 0) {
      return;
    }

    const currentTimeMs = getCurrentTimeMs();
    if (currentTimeMs === null) {
      return;
    }

    const progress = currentTimeMs / durationMs;
    if (!fired.q1 && progress >= 0.25) {
      fired.q1 = true;
      send('q1');
    }
    if (!fired.q2 && progress >= 0.5) {
      fired.q2 = true;
      send('q2');
    }
    if (!fired.q3 && progress >= 0.75) {
      fired.q3 = true;
      send('q3');
    }
    if (!fired.complete && (progress >= 1 || currentTimeMs >= durationMs - 80)) {
      fireComplete('timeupdate');
    }
  }

  function fireComplete(source: 'ended' | 'timeupdate'): void {
    if (fired.complete) {
      return;
    }
    fired.complete = true;
    send('complete', { completeSource: source });
  }

  function isMuted(): boolean {
    return video.muted || video.volume === 0;
  }

  function volumeValue(): number {
    if (!Number.isFinite(video.volume)) {
      return 0;
    }
    return Math.max(0, Math.min(1, Number(video.volume)));
  }

  function cacheBuster(): string {
    return `${now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  function toQueryString(params: Record<string, VideoTrackingParamValue>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined || value === '') {
        continue;
      }
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
    return parts.join('&');
  }

  function send(eventName: keyof VideoTrackingEndpoints, overrides: Record<string, VideoTrackingParamValue> = {}): void {
    const endpoint = endpoints[eventName];
    if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
      return;
    }

    const payload: Record<string, VideoTrackingParamValue> = {
      ts: now(),
      event: eventName,
      ...extraParams,
      ...overrides,
    };

    if (creativeId) {
      payload.creativeId = creativeId;
    }

    const currentTimeMs = getCurrentTimeMs();
    if (currentTimeMs !== null && payload.videoCurrentTimeMs === undefined) {
      payload.videoCurrentTimeMs = currentTimeMs;
    }

    const knownDurationMs = durationMs ?? getDurationMsFromVideo();
    if (knownDurationMs !== null && payload.videoDurationMs === undefined) {
      payload.videoDurationMs = knownDurationMs;
    }

    if (eventName === 'mute' || eventName === 'unmute') {
      payload.muted = isMuted() ? 1 : 0;
      payload.volume = volumeValue();
    }

    if (cacheBust) {
      payload.cb = cacheBuster();
    }

    const query = toQueryString(payload);
    if (!query) {
      return;
    }

    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${endpoint}${separator}${query}`;

    try {
      if (typeof globalObj.Image !== 'function') {
        return;
      }
      const beacon = new (globalObj.Image as new () => HTMLImageElement)();
      beacon.src = url;
    } catch {
      // Tracking must never throw.
    }
  }

  function fireAutoplayFailure(reason: string): void {
    if (fired.autoplay_fail) {
      return;
    }
    fired.autoplay_fail = true;
    send('autoplay_fail', { reason });
  }

  function tryAutoplay(): void {
    const shouldAttemptAutoplay = rawConfig.attemptAutoplay !== false && (video.autoplay || rawConfig.attemptAutoplay === true);
    if (!shouldAttemptAutoplay || typeof video.play !== 'function') {
      return;
    }

    autoplayAttemptToken += 1;
    const token = autoplayAttemptToken;

    try {
      const playResult = video.play();
      if (playResult && typeof playResult.then === 'function' && typeof playResult.catch === 'function') {
        playResult.catch(() => {
          fireAutoplayFailure('promise_rejected');
        });
      }
    } catch {
      fireAutoplayFailure('play_threw');
      return;
    }

    setTimeout(() => {
      if (token !== autoplayAttemptToken) {
        return;
      }
      if (fired.start || userInteracted) {
        return;
      }
      fireAutoplayFailure('timeout');
    }, autoplayTimeoutMs);
  }
}
