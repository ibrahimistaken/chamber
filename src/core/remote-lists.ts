import { compileRules, RuleValidationError } from './matcher.ts';
import {
  resolveAndCompileLists,
  type InstalledListRecord,
  type MergeListsResult,
} from './merge-lists.ts';
import { validateListObject, type ValidatedList } from './validate-list.ts';
import {
  getInstalledLists,
  saveInstalledLists,
  upsertInstalledList,
  type StorageAreaLike,
} from '../storage/rules.ts';

export const MAX_LIST_BYTES = 1_048_576; // 1 MB
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000; // 10 seconds
export const LIST_UPDATE_ALARM_NAME = 'chamber:daily-list-update';
export const LIST_UPDATE_PERIOD_MINUTES = 24 * 60; // 24 hours (daily)

export const DEFAULT_ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
]);

export type RemoteListErrorReason =
  | 'invalid_url'
  | 'insecure_protocol'
  | 'permission_denied'
  | 'network_error'
  | 'timeout'
  | 'http_error'
  | 'too_large'
  | 'invalid_json'
  | 'validation_error'
  | 'id_collision';

export interface PermissionsLike {
  contains(permissions: { origins: string[] }): Promise<boolean>;
  request(permissions: { origins: string[] }): Promise<boolean>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchListOptions {
  readonly fetchFn?: FetchLike;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly permissions?: PermissionsLike;
  readonly requestPermission?: boolean;
}

export type FetchListResult =
  | {
      readonly ok: true;
      readonly raw: unknown;
      readonly list: ValidatedList;
      readonly sourceUrl: string;
    }
  | {
      readonly ok: false;
      readonly reason: RemoteListErrorReason;
      readonly error: string;
    };

export interface InstallListFromUrlOptions extends FetchListOptions {
  readonly storage?: StorageAreaLike;
  readonly enabled?: boolean;
  readonly allowOverwrite?: boolean;
  readonly now?: number;
}

export type InstallListFromUrlResult =
  | {
      readonly ok: true;
      readonly record: InstalledListRecord;
      readonly merged: MergeListsResult;
    }
  | {
      readonly ok: false;
      readonly reason: RemoteListErrorReason;
      readonly error: string;
    };

export interface UpdateInstalledListsOptions extends FetchListOptions {
  readonly storage?: StorageAreaLike;
  readonly now?: number;
}

export interface ListUpdateFailure {
  readonly id: string;
  readonly reason: RemoteListErrorReason;
  readonly error: string;
}

export interface UpdateInstalledListsResult {
  readonly updated: readonly string[];
  readonly unchanged: readonly string[];
  readonly failed: readonly ListUpdateFailure[];
  readonly records: readonly InstalledListRecord[];
}

function getDefaultPermissions(custom?: PermissionsLike): PermissionsLike | undefined {
  if (custom) return custom;
  if (typeof browser !== 'undefined' && browser.permissions) {
    return browser.permissions;
  }
  return undefined;
}

/**
 * Validates that a string is a well-formed HTTPS URL without embedded credentials.
 */
export function parseHttpsListUrl(
  rawUrl: string,
):
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: 'invalid_url' | 'insecure_protocol'; readonly error: string } {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return {
      ok: false,
      reason: 'invalid_url',
      error: `Invalid URL: "${rawUrl}".`,
    };
  }

  if (url.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'insecure_protocol',
      error: `Only HTTPS URLs are allowed (received "${url.protocol}").`,
    };
  }

  if (url.username !== '' || url.password !== '') {
    return {
      ok: false,
      reason: 'invalid_url',
      error: 'URLs with embedded credentials are not allowed.',
    };
  }

  return { ok: true, url };
}

/**
 * Returns the MV3 origin match pattern (`https://example.com/*`) for a given HTTPS URL.
 */
export function getHostOriginPattern(url: URL): string {
  return `${url.origin}/*`;
}

/**
 * Ensures the extension holds host permission for the target URL.
 * `raw.githubusercontent.com` and `gist.githubusercontent.com` are covered by
 * static `host_permissions`; other HTTPS hosts are checked and optionally
 * requested at runtime via `optional_host_permissions`.
 */
export async function ensureHostPermission(
  url: URL,
  options?: {
    readonly permissions?: PermissionsLike;
    readonly requestIfMissing?: boolean;
  },
): Promise<
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'permission_denied'; readonly error: string }
> {
  if (DEFAULT_ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: true };
  }

  const permissions = getDefaultPermissions(options?.permissions);
  if (!permissions) {
    return { ok: true };
  }

  const originPattern = getHostOriginPattern(url);
  const alreadyGranted = await permissions.contains({ origins: [originPattern] });
  if (alreadyGranted) {
    return { ok: true };
  }

  const shouldRequest = options?.requestIfMissing ?? true;
  if (shouldRequest) {
    const granted = await permissions.request({ origins: [originPattern] });
    if (granted) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    reason: 'permission_denied',
    error: `Host permission denied for "${url.origin}".`,
  };
}

async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number,
): Promise<
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'too_large'; readonly error: string }
> {
  const contentLengthHeader = response.headers?.get?.('content-length');
  if (contentLengthHeader !== null && contentLengthHeader !== undefined) {
    const declaredLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body?.cancel?.().catch(() => undefined);
      return {
        ok: false,
        reason: 'too_large',
        error: `List response size (${declaredLength} bytes) exceeds the ${maxBytes}-byte limit.`,
      };
    }
  }

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    const chunks: string[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel().catch(() => undefined);
            return {
              ok: false,
              reason: 'too_large',
              error: `List response exceeds the ${maxBytes}-byte limit.`,
            };
          }
          chunks.push(decoder.decode(value, { stream: true }));
        }
      }
      chunks.push(decoder.decode());
      return { ok: true, text: chunks.join('') };
    } finally {
      reader.releaseLock?.();
    }
  }

  const text = await response.text();
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > maxBytes) {
    return {
      ok: false,
      reason: 'too_large',
      error: `List response size (${byteLength} bytes) exceeds the ${maxBytes}-byte limit.`,
    };
  }

  return { ok: true, text };
}

/**
 * Downloads a filter list over HTTPS, enforcing host permissions, a timeout,
 * a strict byte size limit (default 1 MB), `JSON.parse` (no `eval`), schema
 * validation, and rule compilation checks.
 */
export async function fetchAndValidateList(
  urlString: string,
  options?: FetchListOptions,
): Promise<FetchListResult> {
  const parsedUrl = parseHttpsListUrl(urlString);
  if (!parsedUrl.ok) {
    return parsedUrl;
  }

  const { url } = parsedUrl;
  const permissionCheck = await ensureHostPermission(url, {
    permissions: options?.permissions,
    requestIfMissing: options?.requestPermission ?? true,
  });
  if (!permissionCheck.ok) {
    return permissionCheck;
  }

  const fetchFn: FetchLike = options?.fetchFn ?? fetch;
  const maxBytes = options?.maxBytes ?? MAX_LIST_BYTES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error('FETCH_TIMEOUT'));
    }, timeoutMs);
  });

  let textResult:
    | { readonly ok: true; readonly text: string }
    | { readonly ok: false; readonly reason: 'too_large'; readonly error: string };

  try {
    const response = await Promise.race([
      fetchFn(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        headers: {
          Accept: 'application/json, text/plain;q=0.9',
        },
      }),
      timeoutPromise,
    ]);

    if (!response.ok) {
      return {
        ok: false,
        reason: 'http_error',
        error: `HTTP error ${response.status} while downloading list from "${url.toString()}".`,
      };
    }

    textResult = await Promise.race([
      readResponseTextWithLimit(response, maxBytes),
      timeoutPromise,
    ]);
  } catch (err) {
    if (
      timedOut ||
      (err instanceof Error && (err.name === 'AbortError' || err.message === 'FETCH_TIMEOUT'))
    ) {
      return {
        ok: false,
        reason: 'timeout',
        error: `Timed out after ${timeoutMs}ms while downloading list from "${url.toString()}".`,
      };
    }
    return {
      ok: false,
      reason: 'network_error',
      error: err instanceof Error ? err.message : 'Network error while downloading list.',
    };
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }

  if (!textResult.ok) {
    return textResult;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(textResult.text);
  } catch {
    return {
      ok: false,
      reason: 'invalid_json',
      error: 'Response body is not valid JSON.',
    };
  }

  const validation = validateListObject(parsedJson);
  if (!validation.ok) {
    return {
      ok: false,
      reason: 'validation_error',
      error: validation.error,
    };
  }

  try {
    compileRules([validation.list.rules]);
  } catch (err) {
    if (err instanceof RuleValidationError) {
      return {
        ok: false,
        reason: 'validation_error',
        error: err.message,
      };
    }
    throw err;
  }

  return {
    ok: true,
    raw: parsedJson,
    list: validation.list,
    sourceUrl: url.toString(),
  };
}

/**
 * Downloads a list from an HTTPS URL and installs it.
 * If another installed list already has the same `id` and `allowOverwrite` is
 * not set, rejects with `id_collision` without overwriting the existing list.
 */
export async function installListFromUrl(
  urlString: string,
  options?: InstallListFromUrlOptions,
): Promise<InstallListFromUrlResult> {
  const fetched = await fetchAndValidateList(urlString, {
    fetchFn: options?.fetchFn,
    maxBytes: options?.maxBytes,
    timeoutMs: options?.timeoutMs,
    permissions: options?.permissions,
    requestPermission: options?.requestPermission ?? true,
  });

  if (!fetched.ok) {
    return fetched;
  }

  const existing = await getInstalledLists(options?.storage);
  const colliding = existing.find((record) => record.id === fetched.list.id);

  if (colliding !== undefined && !options?.allowOverwrite) {
    return {
      ok: false,
      reason: 'id_collision',
      error: `A list with id "${fetched.list.id}" is already installed. Overwriting requires explicit user confirmation.`,
    };
  }

  const upserted = await upsertInstalledList(
    {
      raw: fetched.raw,
      sourceUrl: fetched.sourceUrl,
      enabled: options?.enabled ?? (colliding ? colliding.enabled : true),
      updatedAt: options?.now ?? Date.now(),
    },
    options?.storage,
  );

  if (!upserted.ok) {
    return {
      ok: false,
      reason: 'validation_error',
      error: upserted.error,
    };
  }

  return {
    ok: true,
    record: upserted.record,
    merged: upserted.merged,
  };
}

/**
 * Checks all installed lists that have a `sourceUrl` for updates.
 * Only updates a list when the remote `version` is strictly greater than the
 * installed `version`. If fetching or validating a remote update fails, the
 * previously installed list remains untouched and continues working.
 */
export async function updateInstalledLists(
  options?: UpdateInstalledListsOptions,
): Promise<UpdateInstalledListsResult> {
  const existing = await getInstalledLists(options?.storage);
  const currentRecords: InstalledListRecord[] = [...existing];
  const updated: string[] = [];
  const unchanged: string[] = [];
  const failed: ListUpdateFailure[] = [];

  for (let i = 0; i < currentRecords.length; i += 1) {
    const record = currentRecords[i]!;
    if (!record.sourceUrl) {
      continue;
    }

    const fetched = await fetchAndValidateList(record.sourceUrl, {
      fetchFn: options?.fetchFn,
      maxBytes: options?.maxBytes,
      timeoutMs: options?.timeoutMs,
      permissions: options?.permissions,
      requestPermission: false,
    });

    if (!fetched.ok) {
      failed.push({
        id: record.id,
        reason: fetched.reason,
        error: fetched.error,
      });
      continue;
    }

    if (fetched.list.id !== record.id) {
      failed.push({
        id: record.id,
        reason: 'id_collision',
        error: `Remote list id "${fetched.list.id}" does not match installed list id "${record.id}".`,
      });
      continue;
    }

    if (fetched.list.version <= record.version) {
      unchanged.push(record.id);
      continue;
    }

    const candidate: InstalledListRecord = {
      id: record.id,
      sourceUrl: record.sourceUrl,
      raw: fetched.raw,
      version: fetched.list.version,
      enabled: record.enabled,
      updatedAt: options?.now ?? Date.now(),
    };

    const previewRecords = currentRecords.map((item, idx) => (idx === i ? candidate : item));
    const preview = resolveAndCompileLists(previewRecords);
    const previewRecord = preview.records.find((item) => item.id === record.id);

    if (previewRecord?.error !== undefined) {
      failed.push({
        id: record.id,
        reason: 'validation_error',
        error: previewRecord.error,
      });
      continue;
    }

    currentRecords[i] = candidate;
    updated.push(record.id);
  }

  if (updated.length > 0) {
    const merged = await saveInstalledLists(currentRecords, options?.storage);
    return {
      updated,
      unchanged,
      failed,
      records: merged.records,
    };
  }

  return {
    updated,
    unchanged,
    failed,
    records: currentRecords,
  };
}

export interface AlarmLike {
  readonly name: string;
}

export interface AlarmsApiLike {
  get(name: string): Promise<AlarmLike | undefined>;
  create(name: string, alarmInfo: { periodInMinutes: number }): Promise<void> | void;
  onAlarm: {
    addListener(callback: (alarm: AlarmLike) => void): void;
  };
}

export type BackgroundMessage =
  | {
      readonly type: 'chamber:installListFromUrl';
      readonly url: string;
      readonly allowOverwrite?: boolean;
    }
  | {
      readonly type: 'chamber:updateLists';
    };

export function isBackgroundMessage(message: unknown): message is BackgroundMessage {
  if (typeof message !== 'object' || message === null) return false;
  const obj = message as Record<string, unknown>;
  if (obj.type === 'chamber:installListFromUrl') {
    return (
      typeof obj.url === 'string' &&
      (obj.allowOverwrite === undefined || typeof obj.allowOverwrite === 'boolean')
    );
  }
  if (obj.type === 'chamber:updateLists') {
    return true;
  }
  return false;
}

/**
 * Ensures the daily list-update alarm is scheduled and attaches the alarm listener.
 */
export async function registerDailyUpdateAlarm(
  alarmsApi?: AlarmsApiLike,
  updateOptions?: UpdateInstalledListsOptions,
): Promise<void> {
  const api =
    alarmsApi ??
    (typeof browser !== 'undefined' && browser.alarms ? browser.alarms : undefined);
  if (!api) return;

  api.onAlarm.addListener((alarm) => {
    if (alarm.name === LIST_UPDATE_ALARM_NAME) {
      void updateInstalledLists(updateOptions);
    }
  });

  const existing = await api.get(LIST_UPDATE_ALARM_NAME);
  if (!existing) {
    await api.create(LIST_UPDATE_ALARM_NAME, {
      periodInMinutes: LIST_UPDATE_PERIOD_MINUTES,
    });
  }
}

/**
 * Handles background messages for installing a list from a URL or running an update check.
 */
export async function handleBackgroundMessage(
  message: unknown,
  options?: {
    readonly installOptions?: InstallListFromUrlOptions;
    readonly updateOptions?: UpdateInstalledListsOptions;
  },
): Promise<InstallListFromUrlResult | UpdateInstalledListsResult | undefined> {
  if (!isBackgroundMessage(message)) {
    return undefined;
  }

  if (message.type === 'chamber:installListFromUrl') {
    return installListFromUrl(message.url, {
      ...options?.installOptions,
      allowOverwrite: message.allowOverwrite ?? options?.installOptions?.allowOverwrite,
    });
  }

  return updateInstalledLists(options?.updateOptions);
}
