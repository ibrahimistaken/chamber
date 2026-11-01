import React, { useEffect, useState } from 'react';
import {
  fetchCatalogIndex,
  filterCatalogEntries,
  resolveCatalogEntryUrl,
  type CatalogEntry,
} from '../../src/core/catalog';
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

type PopupTab = 'installed' | 'catalog';

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

export default function App({
  locale = 'tr',
  storage,
  fetchFn,
  permissions,
}: AppProps) {
  const messages = getMessages(locale);

  const [activeTab, setActiveTab] = useState<PopupTab>('installed');
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

  // Catalog state
  const [catalogEntries, setCatalogEntries] = useState<readonly CatalogEntry[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('');
  const [catalogCountry, setCatalogCountry] = useState('');

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

  useEffect(() => {
    if (activeTab !== 'catalog' || catalogLoaded) {
      return;
    }
    let active = true;
    setCatalogLoading(true);
    setCatalogError(null);

    fetchCatalogIndex({ fetchFn, permissions })
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setCatalogError(result.error);
          return;
        }
        setCatalogEntries(result.catalog.lists);
        setCatalogLoaded(true);
      })
      .catch((err) => {
        if (!active) return;
        setCatalogError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) {
          setCatalogLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeTab, catalogLoaded, fetchFn, permissions]);

  const installFromRemoteUrl = async (targetUrl: string): Promise<boolean> => {
    setErrorMessage(null);
    setStatusMessage(messages.addingFromUrlStatus);
    setIsAddingUrl(true);

    try {
      const result = await installListFromUrl(targetUrl, {
        storage,
        fetchFn,
        permissions,
      });

      if (!result.ok) {
        setStatusMessage(null);
        setErrorMessage(result.error);
        return false;
      }

      const name = extractListName(result.record);
      setInstalledLists(result.merged.records);
      setCounts(getRuleCounts(result.merged.rules));
      setStatusMessage(messages.listLoadedSuccess(name));
      return true;
    } catch (err) {
      setStatusMessage(null);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsAddingUrl(false);
    }
  };

  const handleAddFromUrl = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await installFromRemoteUrl(urlInput);
    if (ok) {
      setUrlInput('');
    }
  };

  const handleInstallCatalogEntry = async (entry: CatalogEntry) => {
    try {
      const entryUrl = resolveCatalogEntryUrl(entry);
      await installFromRemoteUrl(entryUrl);
    } catch (err) {
      setStatusMessage(null);
      setErrorMessage(err instanceof Error ? err.message : String(err));
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

  const installedIds = new Set(installedLists.map((r) => r.id));
  const availableCategories = Array.from(
    new Set(
      catalogEntries
        .map((e) => e.tags?.category)
        .filter((cat): cat is string => typeof cat === 'string' && cat.length > 0),
    ),
  ).sort();
  const availableCountries = Array.from(
    new Set(
      catalogEntries
        .map((e) => e.tags?.country)
        .filter((country): country is string => typeof country === 'string' && country.length > 0),
    ),
  ).sort();

  const filteredCatalog = filterCatalogEntries(catalogEntries, {
    query: catalogSearch,
    category: catalogCategory,
    country: catalogCountry,
  });

  return (
    <main style={{ minWidth: 320, padding: 12, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>{messages.appTitle}</h1>

      <p data-testid="active-rules-count" style={{ margin: '0 0 10px', fontSize: 13 }}>
        {messages.activeRulesSummary(counts)}
      </p>

      <nav style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button
          type="button"
          data-testid="tab-installed"
          onClick={() => setActiveTab('installed')}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: 12,
            fontWeight: activeTab === 'installed' ? 700 : 400,
            cursor: 'pointer',
          }}
        >
          {messages.tabInstalledLists}
        </button>
        <button
          type="button"
          data-testid="tab-catalog"
          onClick={() => setActiveTab('catalog')}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: 12,
            fontWeight: activeTab === 'catalog' ? 700 : 400,
            cursor: 'pointer',
          }}
        >
          {messages.tabCatalog}
        </button>
      </nav>

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

      {activeTab === 'installed' ? (
        <>
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
        </>
      ) : (
        <section data-testid="catalog-section">
          <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
            <input
              type="search"
              data-testid="catalog-search-input"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder={messages.catalogSearchPlaceholder}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '4px 6px' }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                data-testid="catalog-category-filter"
                value={catalogCategory}
                onChange={(e) => setCatalogCategory(e.target.value)}
                style={{ flex: 1, fontSize: 12, padding: '3px 4px' }}
              >
                <option value="">{messages.catalogAllCategories}</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <select
                data-testid="catalog-country-filter"
                value={catalogCountry}
                onChange={(e) => setCatalogCountry(e.target.value)}
                style={{ flex: 1, fontSize: 12, padding: '3px 4px' }}
              >
                <option value="">{messages.catalogAllCountries}</option>
                {availableCountries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {catalogLoading && (
            <p data-testid="catalog-loading" style={{ fontSize: 12, color: '#4b5563' }}>
              {messages.catalogLoading}
            </p>
          )}

          {catalogError !== null && (
            <p
              role="alert"
              data-testid="catalog-error"
              style={{ fontSize: 12, color: '#b91c1c' }}
            >
              {catalogError}
            </p>
          )}

          {!catalogLoading && catalogError === null && filteredCatalog.length === 0 && (
            <p data-testid="catalog-empty" style={{ fontSize: 12, color: '#6b7280' }}>
              {messages.catalogEmpty}
            </p>
          )}

          {!catalogLoading && catalogError === null && filteredCatalog.length > 0 && (
            <ul
              data-testid="catalog-lists"
              style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}
            >
              {filteredCatalog.map((entry) => {
                const isInstalled = installedIds.has(entry.id);
                const tagParts = [entry.tags?.country, entry.tags?.category]
                  .filter((part): part is string => typeof part === 'string' && part.length > 0)
                  .join(' · ');

                return (
                  <li
                    key={entry.id}
                    data-testid={`catalog-item-${entry.id}`}
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
                      <strong data-testid={`catalog-name-${entry.id}`}>{entry.name}</strong>
                      {isInstalled ? (
                        <span
                          data-testid={`catalog-installed-${entry.id}`}
                          style={{
                            fontSize: 11,
                            color: '#15803d',
                            fontWeight: 600,
                          }}
                        >
                          {messages.catalogInstalledBadge}
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-testid={`catalog-install-${entry.id}`}
                          disabled={isAddingUrl}
                          onClick={() => void handleInstallCatalogEntry(entry)}
                          style={{ fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}
                        >
                          {messages.catalogInstallButton}
                        </button>
                      )}
                    </div>

                    {entry.description !== '' && (
                      <p
                        data-testid={`catalog-desc-${entry.id}`}
                        style={{ margin: '4px 0', fontSize: 11, color: '#374151' }}
                      >
                        {entry.description}
                      </p>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        color: '#6b7280',
                      }}
                    >
                      <span data-testid={`catalog-tags-${entry.id}`}>{tagParts}</span>
                      <span data-testid={`catalog-rules-${entry.id}`}>
                        {messages.catalogRuleCount(entry.ruleCount)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
