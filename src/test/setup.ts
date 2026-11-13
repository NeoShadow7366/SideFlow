import '@testing-library/jest-dom';
import { beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { cleanupPendingUriLaunchFrames } from '../utils/fileMeta';
import { preloadAllLazyChunks } from '../utils/lazyWithPreload';

beforeAll(async () => {
  await preloadAllLazyChunks();
});

beforeEach(() => {
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: vi.fn(() => null),
    });
  }
});

afterEach(() => {
  cleanupPendingUriLaunchFrames();
  cleanup();
});
