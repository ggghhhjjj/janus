import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUpdateService, appReloader } from './app-update.service';

describe('AppUpdateService', () => {
  const unregister = vi.fn(async () => true);
  const getRegistrations = vi.fn(async () => [{ unregister }]);
  const cachesApi = {
    keys: vi.fn(async () => ['ngsw:app:cache', 'other']),
    delete: vi.fn(async () => true),
  };

  let reloadSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    unregister.mockClear();
    getRegistrations.mockClear();
    cachesApi.keys.mockClear();
    cachesApi.delete.mockClear();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations },
    });
    vi.stubGlobal('caches', cachesApi);
    reloadSpy = vi.spyOn(appReloader, 'reload').mockImplementation(() => {});
  });

  afterEach(() => {
    reloadSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('unregisters service workers, deletes caches, and reloads', async () => {
    const service = new AppUpdateService();
    await service.reloadApp();

    expect(getRegistrations).toHaveBeenCalledOnce();
    expect(unregister).toHaveBeenCalledOnce();
    expect(cachesApi.keys).toHaveBeenCalledOnce();
    expect(cachesApi.delete).toHaveBeenCalledWith('ngsw:app:cache');
    expect(cachesApi.delete).toHaveBeenCalledWith('other');
    expect(reloadSpy).toHaveBeenCalledOnce();
  });
});
