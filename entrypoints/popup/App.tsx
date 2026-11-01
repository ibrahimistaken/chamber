import React, { useEffect, useState } from 'react';
import { getMessages, type Locale } from '../../src/core/i18n';
import type { CompiledRules } from '../../src/core/matcher';
import type { InstalledListRecord } from '../../src/core/merge-lists';
import {
  installListFromUrl,
  type FetchLike,
  type PermissionsLike,
} from '../../src/core/remote-lists';
import {
  getActiveRules,
  getInstalledLists,
  removeInstalledList,
  setListEnabled,
  upsertInstalledList,
  type StorageAreaLike,
} from '../../src/storage/rules';

export interface AppProps {
  readonly locale?: Locale;
  readonly storage?: StorageAreaLike;
  readonly fetchFn?: FetchLike;
  readonly permissions?: PermissionsLike;
}

function getRuleCounts(rules: CompiledRules) {
  const accounts = rules.accounts.size;
  const keywords = rules.keywords.length;
  const exclude = rules.exclude.length;
  const scoped = rules.scoped.length;
  return {
    total: accounts + keywords + exclude + scoped,
    accounts,
    keywords,
    exclude,
    scoped,
  };
}

function extractListName(record: InstalledListRecord): string {
  if (typeof record.raw === 'object' && record.raw !== null) {
    const rawName = (record.raw as Record<string, unknown>).name;
    if (typeof rawName === 'string' && rawName.trim().length > 0) {
      return rawName;
    }
  }
  return record.id;
}

function countRecordRules(record: InstalledListRecord): number {
  if (typeof record.raw !== 'object' || record.raw === null) return 0;
  const rules = (record.raw as Record<string, unknown>).rules;
  if (typeof rules !== 'object' || rules === null) return 0;
  const rulesObj = rules as Record<string, unknown>;
  const accounts = Array.isArray(rulesObj.accounts) ? rulesObj.accounts.length : 0;
  const keywords = Array.isArray(rulesObj.keywords) ? rulesObj.keywords.length : 0;
  const exclude = Array.isArray(rulesObj.exclude) ? rulesObj.exclude.length : 0;
  const scoped = Array.isArray(rulesObj.scoped) ? rulesObj.scoped.length : 0;
  return accounts + keywords + exclude + scoped;
}

function formatUpdatedAt(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '-';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export default function App({ locale = 'tr', storage, fetchFn, permissions }: AppProps) {
  const messages = getMessages(locale);

  const [installedLists, setInstalledLists] = useState<readonly InstalledListRecord[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [counts, setCounts] = useState({
    total: 0,
    accounts: 0,
    keywords: 0,
    exclude: 0,
    scoped: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getActiveRules(storage), getInstalledLists(storage)])
      .then(([{ rules }, records]) => {
        if (active) {
          setCounts(getRuleCounts(rules));
          setInstalledLists(records);
        }
      })
      .catch(() => {
        // Storage unavailable outside extension context unless injected in tests.
      });
    return () => {
      active = false;
    };
  }, [storage]);

  const handleAddFromUrl = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(messages.addingFromUrlStatus);
    setIsAddingUrl(true);

    try {
      const result = await installListFromUrl(urlInput, {
        storage,
        fetchFn,
        permissions,
      });

      if (!result.ok) {
        setStatusMessage(null);
        setErrorMessage(result.error);
        return;
      }

      const name = extractListName(result.record);
      setInstalledLists(result.merged.records);
      setCounts(getRuleCounts(result.merged.rules));
      setUrlInput('');
      setStatusMessage(messages.listLoadedSuccess(name));
    } catch (err) {
      setStatusMessage(null);
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAddingUrl(false);
    }
  };

  const handleToggleList = async (id: string, nextEnabled: boolean) => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const merged = await setListEnabled(id, nextEnabled, storage);
      setInstalledLists(merged.records);
      setCounts(getRuleCounts(merged.rules));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteList = async (id: string) => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const merged = await removeInstalledList(id, storage);
      setInstalledLists(merged.records);
      setCounts(getRuleCounts(merged.rules));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLoadList = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonInput);
    } catch {
      setErrorMessage(messages.invalidJsonError);
      return;
    }

    try {
      // Creates an installed list record with no sourceUrl and compiles active rules.
      const result = await upsertInstalledList({ raw: parsed, enabled: true }, storage);
      if (!result.ok) {
        setErrorMessage(`${messages.schemaErrorPrefix} ${result.error}`);
        return;
      }

      const rawName = (parsed as { name: string }).name;
      setInstalledLists(result.merged.records);
      setCounts(getRuleCounts(result.merged.rules));
      setStatusMessage(messages.listLoadedSuccess(rawName));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main style={{ minWidth: 320, padding: 12, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>{messages.appTitle}</h1>

      <p data-testid="active-rules-count" style={{ margin: '0 0 12px', fontSize: 13 }}>
        {messages.activeRulesSummary(counts)}
      </p>

      <section style={{ marginBottom: 14 }}>
        <form data-testid="add-url-form" onSubmit={handleAddFromUrl}>
          <label
            htmlFor="chamber-list-url"
            style={{ display: 'block', fontSize: 13, marginBottom: 4 }}
          >
            {messages.addFromUrlLabel}
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              id="chamber-list-url"
              data-testid="list-url-input"
              type="url"
              value={urlInput}
              disabled={isAddingUrl}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={messages.addFromUrlPlaceholder}
              style={{ flex: 1, fontSize: 12, padding: '4px 6px' }}
            />
            <button
              type="submit"
              data-testid="add-url-button"
              disabled={isAddingUrl}
              style={{ padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
            >
              {messages.addFromUrlButton}
            </button>
          </div>
        </form>
      </section>

      {errorMessage !== null && (
        <p
          role="alert"
          data-testid="list-error"
          style={{ color: '#b91c1c', fontSize: 12, margin: '0 0 10px' }}
        >
          {errorMessage}
        </p>
      )}

      {statusMessage !== null && (
        <p
          role="status"
          data-testid="list-status"
          style={{ color: '#15803d', fontSize: 12, margin: '0 0 10px' }}
        >
          {statusMessage}
        </p>
      )}

      <section data-testid="installed-lists-section" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, margin: '0 0 6px' }}>{messages.installedListsHeading}</h2>
        {installedLists.length === 0 ? (
          <p
            data-testid="no-installed-lists"
            style={{ fontSize: 12, color: '#6b7280', margin: 0 }}
          >
            {messages.noInstalledLists}
          </p>
        ) : (
          <ul
            data-testid="installed-lists"
            style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}
          >
            {installedLists.map((record) => {
              const name = extractListName(record);
              const ruleCount = countRecordRules(record);
              const updatedAtText = formatUpdatedAt(record.updatedAt);

              return (
                <li
                  key={record.id}
                  data-testid={`installed-list-${record.id}`}
                  style={{
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    padding: 8,
                    fontSize: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        data-testid={`toggle-list-${record.id}`}
                        aria-label={messages.toggleListAriaLabel(name)}
                        checked={record.enabled}
                        onChange={(e) => void handleToggleList(record.id, e.target.checked)}
                      />
                      <span data-testid={`list-name-${record.id}`}>{name}</span>
                    </label>
                    <button
                      type="button"
                      data-testid={`delete-list-${record.id}`}
                      aria-label={messages.deleteListAriaLabel(name)}
                      onClick={() => void handleDeleteList(record.id)}
                      style={{ fontSize: 11, padding: '2px 6px', cursor: 'pointer' }}
                    >
                      {messages.deleteListButton}
                    </button>
                  </div>

                  <div
                    data-testid={`list-meta-${record.id}`}
                    style={{ color: '#4b5563', fontSize: 11, marginTop: 4 }}
                  >
                    {messages.listMetaSummary({
                      ruleCount,
                      version: record.version,
                      updatedAtText,
                    })}
                  </div>

                  {record.error !== undefined && (
                    <div
                      role="alert"
                      data-testid={`list-item-error-${record.id}`}
                      style={{ color: '#b91c1c', fontSize: 11, marginTop: 4 }}
                    >
                      {messages.listErrorLabel(record.error)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details data-testid="advanced-section">
        <summary style={{ fontSize: 13, cursor: 'pointer', marginBottom: 6 }}>
          {messages.advancedSectionTitle}
        </summary>
        <form data-testid="paste-json-form" onSubmit={handleLoadList}>
          <label
            htmlFor="chamber-list-json"
            style={{ display: 'block', fontSize: 13, marginBottom: 4 }}
          >
            {messages.pasteListLabel}
          </label>
          <textarea
            id="chamber-list-json"
            data-testid="list-json-input"
            rows={7}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={messages.pasteListPlaceholder}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontFamily: 'monospace',
              fontSize: 12,
            }}
          />
          <button
            type="submit"
            data-testid="load-list-button"
            style={{ marginTop: 8, padding: '6px 12px', cursor: 'pointer' }}
          >
            {messages.loadListButton}
          </button>
        </form>
      </details>
    </main>
  );
}
