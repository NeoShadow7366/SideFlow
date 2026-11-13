import React, { Suspense, forwardRef, lazy } from 'react';

type PreloadTask = () => Promise<void>;

const registeredPreloaders = new Set<PreloadTask>();

export type PreloadableComponent<T extends React.ComponentType<any>> = T & {
  preload: () => Promise<T>;
};

export interface PreloadableModule<M> {
  readonly current: M | null;
  load: () => Promise<M>;
}

/**
 * Code-splits a React component (including `forwardRef` components) via dynamic `import()`
 * while caching the resolved component reference so that once `preload()` has completed,
 * subsequent renders bypass `<Suspense>` microtask delay and mount synchronously.
 */
export function lazyWithPreload<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  fallback: React.ReactNode = null
): PreloadableComponent<T> {
  let resolvedComponent: T | null = null;
  let inflightPromise: Promise<{ default: T }> | null = null;

  const loadModule = (): Promise<{ default: T }> => {
    if (!inflightPromise) {
      inflightPromise = factory()
        .then((mod) => {
          resolvedComponent = mod.default;
          return mod;
        })
        .catch((err) => {
          inflightPromise = null;
          throw err;
        });
    }
    return inflightPromise;
  };

  const LazyInner = lazy(loadModule);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Wrapper = forwardRef<any, any>((props, ref) => {
    // Lock the Fiber branch per mounted Wrapper instance so an instance that mounted
    // via <Suspense><LazyInner /></Suspense> never switches child Fiber types (unmounting
    // its subtree) when `resolvedComponent` settles before a subsequent parent re-render.
    const useDirectRef = React.useRef(resolvedComponent !== null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Resolved = resolvedComponent as any;
    if (useDirectRef.current && Resolved) {
      return ref !== null && ref !== undefined ? (
        <Resolved {...props} ref={ref} />
      ) : (
        <Resolved {...props} />
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const LazyComp = LazyInner as any;
    return (
      <Suspense fallback={fallback}>
        {ref !== null && ref !== undefined ? (
          <LazyComp {...props} ref={ref} />
        ) : (
          <LazyComp {...props} />
        )}
      </Suspense>
    );
  });

  const preload = (): Promise<T> => loadModule().then((mod) => mod.default);
  registeredPreloaders.add(() => preload().then(() => undefined));

  const Enhanced = Wrapper as unknown as PreloadableComponent<T>;
  Enhanced.preload = preload;
  return Enhanced;
}

/**
 * Code-splits a non-component ES module via dynamic `import()`, exposing `.current`
 * for synchronous fast-path access once preloaded and `.load()` for on-demand resolution.
 */
export function lazyModule<M>(factory: () => Promise<M>): PreloadableModule<M> {
  let resolved: M | null = null;
  let inflight: Promise<M> | null = null;

  const load = (): Promise<M> => {
    if (!inflight) {
      inflight = factory()
        .then((mod) => {
          resolved = mod;
          return mod;
        })
        .catch((err) => {
          inflight = null;
          throw err;
        });
    }
    return inflight;
  };

  registeredPreloaders.add(() => load().then(() => undefined));

  return {
    get current() {
      return resolved;
    },
    load,
  };
}

/**
 * Preloads all registered `lazyWithPreload` components and `lazyModule` chunks,
 * including nested lazy chunks discovered as parent modules finish loading.
 */
export async function preloadAllLazyChunks(): Promise<void> {
  const seen = new Set<PreloadTask>();
  while (seen.size < registeredPreloaders.size) {
    const batch = Array.from(registeredPreloaders).filter((fn) => !seen.has(fn));
    batch.forEach((fn) => seen.add(fn));
    await Promise.all(batch.map((fn) => fn()));
  }
}
