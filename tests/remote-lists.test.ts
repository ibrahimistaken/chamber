import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ALLOWED_HOSTS,
  fetchAndValidateList,
  handleBackgroundMessage,
  installListFromUrl,
  LIST_UPDATE_ALARM_NAME,
  LIST_UPDATE_PERIOD_MINUTES,
  MAX_LIST_BYTES,
  registerDailyUpdateAlarm,
  updateInstalledLists,
  type AlarmLike,
  type AlarmsApiLike,
  type FetchLike,
  type PermissionsLike,
} from '../src/core/remote-lists';
import { matchAuthor, matchText } from '../src/core/matcher';
import {
  getActiveRules,
  getInstalledLists,
  upsertInstalledList,
  type StorageAreaLike,
} from '../src/storage/rules';

function createMemoryStorage(): StorageAreaLike {
  const store: Record<string, unknown> = {};
  return {
    async get(key: string) {
      return { [key]: store[key] };
    },
    async set(items: Record<string, unknown>) {
      Object.assign(store, items);
    },
  };
}

function makeValidListJson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uzak-liste',
    name: 'Uzak Liste',
    author: 'test_yazar',
    version: 1,
    rules: {
      accounts: [{ platform: 'x', handle: 'spam_hesap' }],
      keywords: ['reklam'],
    },
    ...overrides,
  };
}

function createJsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

describe('remote-lists: fetchAndValidateList & installListFromUrl', () => {
  it('downloads and validates a valid list over HTTPS from default allowed hosts without requesting optional permissions', async () => {
    const listObj = makeValidListJson();
    const fetchFn: FetchLike = vi.fn(async () => createJsonResponse(listObj));
    const permissions: PermissionsLike = {
      contains: vi.fn(async () => false),
      request: vi.fn(async () => false),
    };

    const url = 'https://raw.githubusercontent.com/ornek/repo/main/lists/uzak-liste.json';
    const result = await fetchAndValidateList(url, { fetchFn, permissions });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.list.id).toBe('uzak-liste');
      expect(result.list.version).toBe(1);
      expect(result.sourceUrl).toBe(url);
    }
    expect(DEFAULT_ALLOWED_HOSTS.has('raw.githubusercontent.com')).toBe(true);
    expect(DEFAULT_ALLOWED_HOSTS.has('gist.githubusercontent.com')).toBe(true);
    expect(permissions.contains).not.toHaveBeenCalled();
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it('requests optional runtime host permission for custom HTTPS domains and rejects when denied', async () => {
    const listObj = makeValidListJson();
    const fetchFn: FetchLike = vi.fn(async () => createJsonResponse(listObj));

    const deniedPermissions: PermissionsLike = {
      contains: vi.fn(async () => false),
      request: vi.fn(async () => false),
    };

    const customUrl = 'https://lists.example.org/chamber/liste.json';
    const denied = await fetchAndValidateList(customUrl, {
      fetchFn,
      permissions: deniedPermissions,
    });

    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe('permission_denied');
    }
    expect(deniedPermissions.contains).toHaveBeenCalledWith({
      origins: ['https://lists.example.org/*'],
    });
    expect(deniedPermissions.request).toHaveBeenCalledWith({
      origins: ['https://lists.example.org/*'],
    });
    expect(fetchFn).not.toHaveBeenCalled();

    const grantedPermissions: PermissionsLike = {
      contains: vi.fn(async () => false),
      request: vi.fn(async () => true),
    };
    const allowed = await fetchAndValidateList(customUrl, {
      fetchFn,
      permissions: grantedPermissions,
    });
    expect(allowed.ok).toBe(true);
  });

  it('rejects non-HTTPS URLs (http, ftp, invalid URLs) without making a network request', async () => {
    const fetchFn: FetchLike = vi.fn(async () => createJsonResponse(makeValidListJson()));

    const httpResult = await fetchAndValidateList(
      'http://raw.githubusercontent.com/ornek/liste.json',
      { fetchFn },
    );
    expect(httpResult.ok).toBe(false);
    if (!httpResult.ok) {
      expect(httpResult.reason).toBe('insecure_protocol');
    }

    const invalidResult = await fetchAndValidateList('not-a-valid-url', { fetchFn });
    expect(invalidResult.ok).toBe(false);
    if (!invalidResult.ok) {
      expect(invalidResult.reason).toBe('invalid_url');
    }

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects responses exceeding the size limit (both via Content-Length and via body stream)', async () => {
    // 1. Oversized Content-Length header
    const headerFetch: FetchLike = vi.fn(async () =>
      createJsonResponse(makeValidListJson(), 200, {
        'content-length': String(MAX_LIST_BYTES + 100),
      }),
    );

    const headerRes = await fetchAndValidateList(
      'https://raw.githubusercontent.com/ornek/buyuk.json',
      { fetchFn: headerFetch },
    );
    expect(headerRes.ok).toBe(false);
    if (!headerRes.ok) {
      expect(headerRes.reason).toBe('too_large');
    }

    // 2. Oversized streamed body without Content-Length header (using small custom maxBytes)
    const bigPayload = JSON.stringify(
      makeValidListJson({
        description: 'x'.repeat(2048),
      }),
    );
    const streamFetch: FetchLike = vi.fn(async () => new Response(bigPayload, { status: 200 }));

    const streamRes = await fetchAndValidateList(
      'https://raw.githubusercontent.com/ornek/buyuk-akis.json',
      { fetchFn: streamFetch, maxBytes: 512 },
    );
    expect(streamRes.ok).toBe(false);
    if (!streamRes.ok) {
      expect(streamRes.reason).toBe('too_large');
    }
  });

  it('rejects responses with invalid JSON syntax or schema validation errors', async () => {
    const badJsonFetch: FetchLike = vi.fn(async () =>
      createJsonResponse('{ "id": "bozuk-json", ', 200),
    );
    const badJsonRes = await fetchAndValidateList(
      'https://raw.githubusercontent.com/ornek/bozuk.json',
      { fetchFn: badJsonFetch },
    );
    expect(badJsonRes.ok).toBe(false);
    if (!badJsonRes.ok) {
      expect(badJsonRes.reason).toBe('invalid_json');
    }

    const badSchemaFetch: FetchLike = vi.fn(async () =>
      createJsonResponse({ id: 'INVALID ID', name: 'X' }, 200),
    );
    const badSchemaRes = await fetchAndValidateList(
      'https://raw.githubusercontent.com/ornek/gecersiz-sema.json',
      { fetchFn: badSchemaFetch },
    );
    expect(badSchemaRes.ok).toBe(false);
    if (!badSchemaRes.ok) {
      expect(badSchemaRes.reason).toBe('validation_error');
    }
  });

  it('aborts and rejects when fetch exceeds the timeout', async () => {
    const slowFetch: FetchLike = vi.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted.');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        }),
    );

    const res = await fetchAndValidateList(
      'https://raw.githubusercontent.com/ornek/yavas.json',
      { fetchFn: slowFetch, timeoutMs: 25 },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('timeout');
    }
  });

  it('refuses to overwrite an already installed list with the same id unless explicitly confirmed', async () => {
    const storage = createMemoryStorage();

    // First install a local list with id "ortak-id"
    await upsertInstalledList(
      {
        raw: makeValidListJson({
          id: 'ortak-id',
          version: 1,
          rules: { accounts: [{ platform: 'x', handle: 'yerel_hesap' }] },
        }),
      },
      storage,
    );

    // Attempt to install a remote list that also uses id "ortak-id"
    const remoteList = makeValidListJson({
      id: 'ortak-id',
      version: 5,
      rules: { accounts: [{ platform: 'x', handle: 'uzak_hesap' }] },
    });
    const fetchFn: FetchLike = vi.fn(async () => createJsonResponse(remoteList));

    const collisionResult = await installListFromUrl(
      'https://raw.githubusercontent.com/ornek/ortak.json',
      { fetchFn, storage },
    );

    expect(collisionResult.ok).toBe(false);
    if (!collisionResult.ok) {
      expect(collisionResult.reason).toBe('id_collision');
    }

    // Verify the original list was NOT overwritten
    const installed = await getInstalledLists(storage);
    expect(installed).toHaveLength(1);
    expect(installed[0]?.version).toBe(1);
    const active = await getActiveRules(storage);
    expect(matchAuthor('x', 'yerel_hesap', active.rules)).toBe(true);
    expect(matchAuthor('x', 'uzak_hesap', active.rules)).toBe(false);
  });
});

describe('remote-lists: updateInstalledLists & version comparison', () => {
  it('updates only when the remote version is strictly greater than the installed version', async () => {
    const storage = createMemoryStorage();
    const urlA = 'https://raw.githubusercontent.com/ornek/liste-a.json';
    const urlB = 'https://raw.githubusercontent.com/ornek/liste-b.json';
    const urlC = 'https://raw.githubusercontent.com/ornek/liste-c.json';

    await installListFromUrl(urlA, {
      storage,
      fetchFn: async () =>
        createJsonResponse(
          makeValidListJson({
            id: 'liste-a',
            version: 2,
            rules: { keywords: ['eski_kelime'] },
          }),
        ),
    });

    await installListFromUrl(urlB, {
      storage,
      fetchFn: async () =>
        createJsonResponse(
          makeValidListJson({
            id: 'liste-b',
            version: 3,
            rules: { keywords: ['sabit_kelime'] },
          }),
        ),
    });

    await installListFromUrl(urlC, {
      storage,
      fetchFn: async () =>
        createJsonResponse(
          makeValidListJson({
            id: 'liste-c',
            version: 4,
            rules: { keywords: ['korunan_kelime'] },
          }),
        ),
    });

    // Remote state:
    // liste-a: version 2 -> 3 (should update)
    // liste-b: version 3 -> 3 (same version, should not update)
    // liste-c: version 4 -> 1 (lower version, should not downgrade)
    const updateFetch: FetchLike = vi.fn(async (input: string) => {
      if (input === urlA) {
        return createJsonResponse(
          makeValidListJson({
            id: 'liste-a',
            version: 3,
            rules: { keywords: ['yeni_kelime'] },
          }),
        );
      }
      if (input === urlB) {
        return createJsonResponse(
          makeValidListJson({
            id: 'liste-b',
            version: 3,
            rules: { keywords: ['degismemis_ama_ayni_surum'] },
          }),
        );
      }
      return createJsonResponse(
        makeValidListJson({
          id: 'liste-c',
          version: 1,
          rules: { keywords: ['eski_surume_donme'] },
        }),
      );
    });

    const result = await updateInstalledLists({
      storage,
      fetchFn: updateFetch,
      now: 123456,
    });

    expect(result.updated).toEqual(['liste-a']);
    expect(result.unchanged).toEqual(['liste-b', 'liste-c']);
    expect(result.failed).toEqual([]);

    const active = await getActiveRules(storage);
    expect(matchText('yeni_kelime burada', active.rules).matched).toBe(true);
    expect(matchText('eski_kelime burada', active.rules).matched).toBe(false);
    expect(matchText('sabit_kelime burada', active.rules).matched).toBe(true);
    expect(matchText('korunan_kelime burada', active.rules).matched).toBe(true);
  });

  it('preserves the existing working list when an update fails (network error, HTTP error, invalid JSON, or invalid schema)', async () => {
    const storage = createMemoryStorage();
    const urlNetErr = 'https://raw.githubusercontent.com/ornek/ag-hatasi.json';
    const urlBadJson = 'https://raw.githubusercontent.com/ornek/bozuk-guncelleme.json';

    await installListFromUrl(urlNetErr, {
      storage,
      fetchFn: async () =>
        createJsonResponse(
          makeValidListJson({
            id: 'ag-hatasi',
            version: 1,
            rules: { accounts: [{ platform: 'x', handle: 'calisan_hesap_1' }] },
          }),
        ),
    });

    await installListFromUrl(urlBadJson, {
      storage,
      fetchFn: async () =>
        createJsonResponse(
          makeValidListJson({
            id: 'bozuk-guncelleme',
            version: 2,
            rules: { keywords: ['calisan_kelime_2'] },
          }),
        ),
    });

    const failingFetch: FetchLike = vi.fn(async (input: string) => {
      if (input === urlNetErr) {
        throw new Error('Network disconnected');
      }
      return createJsonResponse('<<< not json >>>', 200);
    });

    const updateResult = await updateInstalledLists({
      storage,
      fetchFn: failingFetch,
    });

    expect(updateResult.updated).toEqual([]);
    expect(updateResult.failed).toHaveLength(2);
    expect(updateResult.failed.map((f) => f.id)).toEqual([
      'ag-hatasi',
      'bozuk-guncelleme',
    ]);

    // Both previously installed lists and their compiled active rules must continue working
    const installed = await getInstalledLists(storage);
    expect(installed).toHaveLength(2);
    expect(installed.find((r) => r.id === 'ag-hatasi')?.version).toBe(1);
    expect(installed.find((r) => r.id === 'bozuk-guncelleme')?.version).toBe(2);

    const active = await getActiveRules(storage);
    expect(matchAuthor('x', 'calisan_hesap_1', active.rules)).toBe(true);
    expect(matchText('bu metinde calisan_kelime_2 geciyor', active.rules).matched).toBe(true);
  });

  it('registers daily update alarm (1440 min) and runs update check on alarm & message', async () => {
    const storage = createMemoryStorage();
    const url = 'https://raw.githubusercontent.com/ornek/alarm-liste.json';

    let currentVersion = 1;
    const fetchFn: FetchLike = vi.fn(async () =>
      createJsonResponse(
        makeValidListJson({
          id: 'alarm-liste',
          version: currentVersion,
          rules: { keywords: [`surum_${currentVersion}`] },
        }),
      ),
    );

    await handleBackgroundMessage(
      { type: 'chamber:installListFromUrl', url },
      { installOptions: { storage, fetchFn } },
    );

    const listeners: Array<(alarm: AlarmLike) => void> = [];
    const alarmsApi: AlarmsApiLike = {
      get: vi.fn(async () => undefined),
      create: vi.fn(async () => undefined),
      onAlarm: {
        addListener: (cb) => {
          listeners.push(cb);
        },
      },
    };

    await registerDailyUpdateAlarm(alarmsApi, { storage, fetchFn });

    expect(alarmsApi.create).toHaveBeenCalledWith(LIST_UPDATE_ALARM_NAME, {
      periodInMinutes: LIST_UPDATE_PERIOD_MINUTES,
    });
    expect(LIST_UPDATE_PERIOD_MINUTES).toBe(1440);

    // Bump remote version and fire the alarm
    currentVersion = 2;
    listeners[0]?.({ name: LIST_UPDATE_ALARM_NAME });

    // Also test direct update message
    const updateMsgRes = await handleBackgroundMessage(
      { type: 'chamber:updateLists' },
      { updateOptions: { storage, fetchFn } },
    );
    expect(updateMsgRes).toBeDefined();

    const installed = await getInstalledLists(storage);
    expect(installed[0]?.version).toBe(2);
  });
});
