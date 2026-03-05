import { afterEach, describe, expect, test, vi } from 'vitest';
import { AdworksVideoTrackingConfig, initAdworksVideoTracking } from '../src/videoTracking';

type Listener = () => void;

class MockVideo {
  currentTime = 0;
  duration = Number.NaN;
  muted = true;
  volume = 1;
  paused = true;
  autoplay = true;
  readyState = 0;

  private readonly listeners = new Map<string, Listener[]>();
  private playImpl: (() => Promise<void>) | null = null;

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
  }

  setPlayImplementation(impl: () => Promise<void>): void {
    this.playImpl = impl;
  }

  dispatch(type: string): void {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener();
    }
  }

  play(): Promise<void> {
    if (this.playImpl) {
      return this.playImpl();
    }
    this.paused = false;
    return Promise.resolve();
  }
}

type Harness = {
  pings: string[];
  video: MockVideo;
  windowMock: Record<string, unknown>;
};

function buildHarness(overrides: Partial<AdworksVideoTrackingConfig> = {}): Harness {
  const pings: string[] = [];
  const video = new MockVideo();

  class Beacon {
    set src(value: string) {
      pings.push(value);
    }
  }

  const baseConfig: AdworksVideoTrackingConfig = {
    enabled: true,
    videoSelector: 'video',
    cacheBust: false,
    endpoints: {
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
    },
    extraParams: {},
    attemptAutoplay: true,
    autoplayTimeoutMs: 2_000,
  };

  const windowMock = {
    __ADWORKS_VIDEO_TRACKING__: {
      ...baseConfig,
      ...overrides,
      endpoints: {
        ...baseConfig.endpoints,
        ...overrides.endpoints,
      },
      extraParams: {
        ...baseConfig.extraParams,
        ...overrides.extraParams,
      },
    },
    document: {
      querySelector: () => video,
    },
    Image: Beacon,
    Date,
    setTimeout,
    addEventListener: () => {
      // no-op for tests unless explicitly needed
    },
  } as Record<string, unknown>;

  return { pings, video, windowMock };
}

function countEvents(pings: string[], eventName: string): number {
  return pings.filter((url) => new URL(url).searchParams.get('event') === eventName).length;
}

function replayCounts(pings: string[]): string[] {
  return pings
    .filter((url) => new URL(url).searchParams.get('event') === 'replay')
    .map((url) => new URL(url).searchParams.get('replayCount') ?? '');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('video tracking runtime', () => {
  test('fires quartiles and complete once only', () => {
    const { pings, video, windowMock } = buildHarness();
    video.duration = 8;
    video.readyState = 1;

    initAdworksVideoTracking(windowMock);

    video.paused = false;
    video.dispatch('playing');

    video.currentTime = 2.2;
    video.dispatch('timeupdate');
    video.currentTime = 2.6;
    video.dispatch('timeupdate');
    video.currentTime = 4.3;
    video.dispatch('timeupdate');
    video.currentTime = 6.5;
    video.dispatch('timeupdate');
    video.currentTime = 8.0;
    video.dispatch('timeupdate');
    video.dispatch('ended');

    expect(countEvents(pings, 'start')).toBe(1);
    expect(countEvents(pings, 'q1')).toBe(1);
    expect(countEvents(pings, 'q2')).toBe(1);
    expect(countEvents(pings, 'q3')).toBe(1);
    expect(countEvents(pings, 'complete')).toBe(1);
  });

  test('queues quartile checks until duration becomes finite', () => {
    const { pings, video, windowMock } = buildHarness();
    video.duration = Number.NaN;
    video.readyState = 0;

    initAdworksVideoTracking(windowMock);

    video.currentTime = 1.0;
    video.dispatch('timeupdate');
    expect(countEvents(pings, 'q1')).toBe(0);

    video.duration = 4.0;
    video.readyState = 1;
    video.dispatch('loadedmetadata');

    expect(countEvents(pings, 'duration')).toBe(1);
    expect(countEvents(pings, 'q1')).toBe(1);
    expect(countEvents(pings, 'q2')).toBe(0);
  });

  test('fires autoplay_fail once when play promise rejects', async () => {
    vi.useFakeTimers();
    const { pings, video, windowMock } = buildHarness();
    video.setPlayImplementation(() => Promise.reject(new Error('blocked')));

    initAdworksVideoTracking(windowMock);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2_100);

    expect(countEvents(pings, 'autoplay_fail')).toBe(1);
  });

  test('increments replay count after ended then playing', () => {
    const { pings, video, windowMock } = buildHarness();
    video.duration = 5;
    video.readyState = 1;

    initAdworksVideoTracking(windowMock);

    video.paused = false;
    video.dispatch('playing');
    video.currentTime = 5;
    video.dispatch('ended');

    video.currentTime = 0;
    video.dispatch('playing');
    video.currentTime = 5;
    video.dispatch('ended');
    video.currentTime = 0;
    video.dispatch('playing');

    expect(countEvents(pings, 'replay')).toBe(2);
    expect(replayCounts(pings)).toEqual(['1', '2']);
  });
});
