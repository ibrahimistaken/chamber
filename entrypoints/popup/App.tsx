import React, { useEffect, useRef, useState } from 'react';
import {
  fetchCatalogIndex,
  filterCatalogEntries,
  resolveCatalogEntryUrl,
  type CatalogEntry,
} from '../../src/core/catalog';
import {
  getMessages,
  LOCALE_FLAGS,
  LOCALE_NATIVE_NAMES,
  SUPPORTED_LOCALES,
  type Locale,
} from '../../src/core/i18n';
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
import { getSavedLocale, saveLocale } from '../../src/storage/settings';
import { Dropdown } from './Dropdown';
import {
  IconCatalogTab,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDownload,
  IconHamburgerMenu,
  IconLink,
  IconListTab,
  IconPlus,
  IconSearch,
  IconSliders,
  IconTrash,
} from './Icons';
import { Notice } from './Notice';

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

type PopupView = 'home' | 'settings' | 'settings-preferences' | 'settings-language';

export default function App({ locale = 'tr', storage, fetchFn, permissions }: AppProps) {
  const [currentLocale, setCurrentLocale] = useState<Locale>(locale);
  const [view, setView] = useState<PopupView>('home');

  const messages = getMessages(currentLocale);

  const installedTabRef = useRef<HTMLButtonElement>(null);
  const catalogTabRef = useRef<HTMLButtonElement>(null);

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
    setCurrentLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = currentLocale;
    }
  }, [currentLocale]);

  useEffect(() => {
    let active = true;
    Promise.all([getActiveRules(storage), getInstalledLists(storage), getSavedLocale(storage)])
      .then(([{ rules }, records, savedLocale]) => {
        if (active) {
          setCounts(getRuleCounts(rules));
          setInstalledLists(records);
          if (savedLocale !== undefined) {
            setCurrentLocale(savedLocale);
          }
        }
      })
      .catch(() => {
        // Storage unavailable outside extension context unless injected in tests.
      });
    return () => {
      active = false;
    };
  }, [storage]);

  const handleSelectLocale = async (nextLocale: Locale) => {
    setCurrentLocale(nextLocale);
    try {
      await saveLocale(nextLocale, storage);
    } catch {
      // Ignore storage write errors outside extension context.
    }
  };

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

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const nextTab: PopupTab = activeTab === 'installed' ? 'catalog' : 'installed';
    setActiveTab(nextTab);
    if (nextTab === 'installed') {
      installedTabRef.current?.focus();
    } else {
      catalogTabRef.current?.focus();
    }
  };

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

  if (view === 'settings-language') {
    return (
      <main data-testid="settings-language-page" className="chamber-popup chamber-settings-page">
        <header className="chamber-settings-header">
          <button
            type="button"
            aria-label={messages.settingsBackButtonLabel}
            data-testid="settings-language-back-button"
            className="chamber-icon-btn chamber-icon-btn-start"
            onClick={() => setView('settings-preferences')}
          >
            <IconChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <h1 data-testid="settings-language-title" className="chamber-settings-title">
            {messages.settingsLanguageHeading}
          </h1>
          <button
            type="button"
            aria-label={messages.settingsCloseButtonLabel}
            data-testid="settings-close-button"
            className="chamber-icon-btn chamber-icon-btn-end"
            onClick={() => setView('home')}
          >
            <IconClose size={17} strokeWidth={1.75} />
          </button>
        </header>

        <div
          role="radiogroup"
          aria-label={messages.settingsLanguageHeading}
          data-testid="settings-menu"
          className="chamber-settings-list"
        >
          {SUPPORTED_LOCALES.map((loc) => {
            const isSelected = loc === currentLocale;
            return (
              <button
                key={loc}
                type="button"
                role="radio"
                aria-checked={isSelected}
                data-testid={`locale-option-${loc}`}
                className="chamber-settings-row"
                onClick={() => void handleSelectLocale(loc)}
              >
                <span className="chamber-settings-row-leading">
                  <span className="chamber-locale-flag" aria-hidden="true">
                    {LOCALE_FLAGS[loc]}
                  </span>
                  <span className="chamber-settings-row-label">{LOCALE_NATIVE_NAMES[loc]}</span>
                </span>
                {isSelected && (
                  <span className="chamber-settings-row-trailing" aria-hidden="true">
                    <span className="chamber-settings-row-check">
                      <IconCheck size={14} strokeWidth={2.25} />
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </main>
    );
  }

  if (view === 'settings-preferences') {
    return (
      <main data-testid="settings-preferences-page" className="chamber-popup chamber-settings-page">
        <header className="chamber-settings-header">
          <button
            type="button"
            aria-label={messages.settingsBackButtonLabel}
            data-testid="settings-preferences-back-button"
            className="chamber-icon-btn chamber-icon-btn-start"
            onClick={() => setView('settings')}
          >
            <IconChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <h1 data-testid="settings-preferences-title" className="chamber-settings-title">
            {messages.settingsPreferencesRow}
          </h1>
          <button
            type="button"
            aria-label={messages.settingsCloseButtonLabel}
            data-testid="settings-close-button"
            className="chamber-icon-btn chamber-icon-btn-end"
            onClick={() => setView('home')}
          >
            <IconClose size={17} strokeWidth={1.75} />
          </button>
        </header>

        <div className="chamber-settings-list">
          <button
            type="button"
            data-testid="settings-language-row"
            className="chamber-settings-row"
            onClick={() => setView('settings-language')}
          >
            <span className="chamber-settings-row-label">{messages.settingsLanguageHeading}</span>
            <span className="chamber-settings-row-trailing">
              <span className="chamber-settings-row-value">
                <span className="chamber-locale-flag" aria-hidden="true">
                  {LOCALE_FLAGS[currentLocale]}
                </span>
                <span>{LOCALE_NATIVE_NAMES[currentLocale]}</span>
              </span>
              <span aria-hidden="true" style={{ display: 'inline-flex' }}>
                <IconChevronRight size={14} strokeWidth={1.65} />
              </span>
            </span>
          </button>
        </div>
      </main>
    );
  }

  if (view === 'settings') {
    return (
      <main data-testid="settings-page" className="chamber-popup chamber-settings-page">
        <header className="chamber-settings-header">
          <button
            type="button"
            aria-label={messages.settingsBackButtonLabel}
            data-testid="settings-back-button"
            className="chamber-icon-btn chamber-icon-btn-start"
            onClick={() => setView('home')}
          >
            <IconChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <h1 data-testid="settings-page-title" className="chamber-settings-title">
            {messages.settingsButtonLabel}
          </h1>
          <span className="chamber-settings-header-spacer" aria-hidden="true" />
        </header>

        <section
          aria-labelledby="chamber-settings-general-heading"
          className="chamber-settings-group"
        >
          <h2 id="chamber-settings-general-heading" className="chamber-settings-group-title">
            {messages.settingsGeneralHeading}
          </h2>

          <div className="chamber-settings-list">
            <button
              type="button"
              data-testid="settings-preferences-row"
              className="chamber-settings-row"
              onClick={() => setView('settings-preferences')}
            >
              <span className="chamber-settings-row-leading">
                <span className="chamber-settings-row-icon" aria-hidden="true">
                  <IconSliders size={16} />
                </span>
                <span className="chamber-settings-row-label">
                  {messages.settingsPreferencesRow}
                </span>
              </span>
              <span className="chamber-settings-row-trailing" aria-hidden="true">
                <IconChevronRight size={14} strokeWidth={1.65} />
              </span>
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="chamber-popup">
      <header className="chamber-header">
        <h1 className="chamber-sr-only">{messages.appTitle}</h1>

        <div className="chamber-stats-card">
          <p data-testid="active-rules-count" className="chamber-sr-only">
            {messages.activeRulesSummary(counts)}
          </p>

          <div className="chamber-stats-hero">
            <div className="chamber-stats-primary" aria-hidden="true">
              <div className="chamber-stats-label-row">
                <span className="chamber-stats-dot" />
                <span className="chamber-stats-label">{messages.statsCardTitle}</span>
              </div>
              <span data-testid="stats-total-value" className="chamber-stats-total">
                {counts.total}
              </span>
            </div>

            <button
              type="button"
              aria-label={messages.settingsButtonLabel}
              data-testid="settings-button"
              className="chamber-icon-btn"
              onClick={() => setView('settings')}
            >
              <IconHamburgerMenu size={18} strokeWidth={1.85} />
            </button>
          </div>

          <dl className="chamber-stats-row" aria-hidden="true">
            <div className="chamber-stat chamber-stat-accent">
              <dt className="chamber-stat-caption">{messages.statsKeywordsLabel}</dt>
              <dd data-testid="stats-keywords-value" className="chamber-stat-value">
                {counts.keywords}
              </dd>
            </div>
            <div className="chamber-stat">
              <dt className="chamber-stat-caption">{messages.statsAccountsLabel}</dt>
              <dd data-testid="stats-accounts-value" className="chamber-stat-value">
                {counts.accounts}
              </dd>
            </div>
            <div className="chamber-stat">
              <dt className="chamber-stat-caption">{messages.statsExcludeLabel}</dt>
              <dd data-testid="stats-exclude-value" className="chamber-stat-value">
                {counts.exclude}
              </dd>
            </div>
            <div className="chamber-stat">
              <dt className="chamber-stat-caption">{messages.statsScopedLabel}</dt>
              <dd data-testid="stats-scoped-value" className="chamber-stat-value">
                {counts.scoped}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div
        role="tablist"
        aria-label={messages.appTitle}
        className="chamber-tablist"
        onKeyDown={handleTabKeyDown}
      >
        <button
          ref={installedTabRef}
          id="chamber-tab-installed"
          type="button"
          role="tab"
          aria-selected={activeTab === 'installed'}
          aria-controls="chamber-panel-installed"
          tabIndex={activeTab === 'installed' ? 0 : -1}
          data-testid="tab-installed"
          className="chamber-tab"
          onClick={() => setActiveTab('installed')}
        >
          <IconListTab size={15} active={activeTab === 'installed'} />
          <span>{messages.tabInstalledLists}</span>
        </button>
        <button
          ref={catalogTabRef}
          id="chamber-tab-catalog"
          type="button"
          role="tab"
          aria-selected={activeTab === 'catalog'}
          aria-controls="chamber-panel-catalog"
          tabIndex={activeTab === 'catalog' ? 0 : -1}
          data-testid="tab-catalog"
          className="chamber-tab"
          onClick={() => setActiveTab('catalog')}
        >
          <IconCatalogTab size={15} active={activeTab === 'catalog'} />
          <span>{messages.tabCatalog}</span>
        </button>
      </div>

      {errorMessage !== null && (
        <Notice
          tone="error"
          role="alert"
          testId="list-error"
          message={errorMessage}
          dismissLabel={messages.dismissNotice}
          onDismiss={() => setErrorMessage(null)}
        />
      )}

      {/* Persistent polite live region so screen readers reliably announce status updates (better-accessibility) */}
      <div role="status" aria-live="polite" aria-atomic="true" className="chamber-live-region">
        {statusMessage !== null && (
          <Notice
            tone={isAddingUrl ? 'loading' : 'success'}
            testId="list-status"
            message={statusMessage}
            dismissLabel={messages.dismissNotice}
            onDismiss={isAddingUrl ? undefined : () => setStatusMessage(null)}
          />
        )}
      </div>

      {activeTab === 'installed' ? (
        <div
          id="chamber-panel-installed"
          role="tabpanel"
          aria-labelledby="chamber-tab-installed"
          className="chamber-tabpanel"
        >
          <section data-testid="installed-lists-section" className="chamber-section">
            <div className="chamber-section-header">
              <h2 className="chamber-section-title">{messages.installedListsHeading}</h2>
            </div>

            {installedLists.length === 0 ? (
              <div className="chamber-empty">
                <p data-testid="no-installed-lists" className="chamber-empty-title">
                  {messages.noInstalledLists}
                </p>
                <p className="chamber-empty-hint">{messages.noInstalledListsHint}</p>
                <button
                  type="button"
                  data-testid="empty-browse-catalog"
                  className="chamber-btn chamber-btn-secondary chamber-btn-compact"
                  onClick={() => {
                    setActiveTab('catalog');
                    catalogTabRef.current?.focus();
                  }}
                >
                  <span>{messages.browseCatalogButton}</span>
                </button>
              </div>
            ) : (
              <ul data-testid="installed-lists" className="chamber-list">
                {installedLists.map((record) => {
                  const name = extractListName(record);
                  const ruleCount = countRecordRules(record);
                  const updatedAtText = formatUpdatedAt(record.updatedAt);

                  return (
                    <li
                      key={record.id}
                      data-testid={`installed-list-${record.id}`}
                      className="chamber-card"
                    >
                      <div className="chamber-card-top">
                        <label className="chamber-toggle-label">
                          <input
                            type="checkbox"
                            data-testid={`toggle-list-${record.id}`}
                            aria-label={messages.toggleListAriaLabel(name)}
                            checked={record.enabled}
                            onChange={(e) => void handleToggleList(record.id, e.target.checked)}
                            className="chamber-switch-input"
                          />
                          <span className="chamber-switch-track" aria-hidden="true">
                            <span className="chamber-switch-thumb" />
                          </span>
                          <span
                            data-testid={`list-name-${record.id}`}
                            className="chamber-list-name"
                          >
                            <bdi>{name}</bdi>
                          </span>
                        </label>
                        <button
                          type="button"
                          data-testid={`delete-list-${record.id}`}
                          aria-label={messages.deleteListAriaLabel(name)}
                          onClick={() => void handleDeleteList(record.id)}
                          className="chamber-btn chamber-btn-danger-ghost"
                        >
                          <IconTrash size={13} strokeWidth={2} />
                          <span>{messages.deleteListButton}</span>
                        </button>
                      </div>

                      <div
                        data-testid={`list-meta-${record.id}`}
                        className="chamber-card-meta chamber-card-meta-indented"
                      >
                        {messages.listMetaSummary({
                          ruleCount,
                          version: record.version,
                          updatedAtText,
                        })}
                      </div>

                      {record.error !== undefined && (
                        <Notice
                          tone="error"
                          role="alert"
                          testId={`list-item-error-${record.id}`}
                          message={messages.listErrorLabel(record.error)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <details data-testid="advanced-section" className="chamber-disclosure">
            <summary className="chamber-disclosure-summary">
              <span className="chamber-disclosure-chevron">
                <IconChevronRight size={14} />
              </span>
              <span>{messages.advancedSectionTitle}</span>
            </summary>
            <div className="chamber-disclosure-body">
              <form data-testid="add-url-form" onSubmit={handleAddFromUrl}>
                <label htmlFor="chamber-list-url" className="chamber-field-label">
                  {messages.addFromUrlLabel}
                </label>
                <div className="chamber-input-row">
                  <div className="chamber-input-wrapper">
                    <span className="chamber-input-icon">
                      <IconLink size={14} />
                    </span>
                    <input
                      id="chamber-list-url"
                      name="listUrl"
                      data-testid="list-url-input"
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      value={urlInput}
                      disabled={isAddingUrl}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder={messages.addFromUrlPlaceholder}
                      className="chamber-input chamber-input-with-icon"
                    />
                  </div>
                  <button
                    type="submit"
                    data-testid="add-url-button"
                    disabled={isAddingUrl}
                    className="chamber-btn chamber-btn-primary"
                  >
                    <IconPlus size={14} strokeWidth={2} />
                    <span>{messages.addFromUrlButton}</span>
                  </button>
                </div>
              </form>

              <form data-testid="paste-json-form" onSubmit={handleLoadList}>
                <label htmlFor="chamber-list-json" className="chamber-field-label">
                  {messages.pasteListLabel}
                </label>
                <textarea
                  id="chamber-list-json"
                  name="listJson"
                  data-testid="list-json-input"
                  rows={6}
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder={messages.pasteListPlaceholder}
                  className="chamber-textarea"
                />
                <button
                  type="submit"
                  data-testid="load-list-button"
                  className="chamber-btn chamber-btn-secondary"
                  style={{ marginBlockStart: 8 }}
                >
                  <span>{messages.loadListButton}</span>
                </button>
              </form>
            </div>
          </details>
        </div>
      ) : (
        <section
          id="chamber-panel-catalog"
          role="tabpanel"
          aria-labelledby="chamber-tab-catalog"
          data-testid="catalog-section"
          className="chamber-tabpanel"
        >
          <div className="chamber-catalog-filters">
            <div className="chamber-input-wrapper">
              <span className="chamber-input-icon">
                <IconSearch size={14} />
              </span>
              <input
                type="search"
                name="catalogSearch"
                aria-label={messages.catalogSearchLabel}
                data-testid="catalog-search-input"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder={messages.catalogSearchPlaceholder}
                className="chamber-input chamber-input-with-icon"
              />
            </div>

            <div className="chamber-catalog-select-row">
              <Dropdown
                ariaLabel={messages.catalogCategoryLabel}
                testId="catalog-category-filter"
                value={catalogCategory}
                onChange={setCatalogCategory}
                options={[
                  { value: '', label: messages.catalogAllCategories },
                  ...availableCategories.map((cat) => ({ value: cat, label: cat })),
                ]}
              />
              <Dropdown
                ariaLabel={messages.catalogCountryLabel}
                testId="catalog-country-filter"
                value={catalogCountry}
                onChange={setCatalogCountry}
                options={[
                  { value: '', label: messages.catalogAllCountries },
                  ...availableCountries.map((country) => ({ value: country, label: country })),
                ]}
              />
            </div>
          </div>

          {catalogLoading && (
            <div data-testid="catalog-loading" role="status" className="chamber-skeleton-list">
              <span className="chamber-sr-only">{messages.catalogLoading}</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="chamber-skeleton-card" aria-hidden="true">
                  <div className="chamber-skeleton-row">
                    <span className="chamber-skeleton-line" style={{ width: '58%' }} />
                    <span className="chamber-skeleton-pill" />
                  </div>
                  <span className="chamber-skeleton-line chamber-skeleton-line-sm" />
                  <span
                    className="chamber-skeleton-line chamber-skeleton-line-sm"
                    style={{ width: '72%' }}
                  />
                </div>
              ))}
            </div>
          )}

          {catalogError !== null && (
            <Notice tone="error" role="alert" testId="catalog-error" message={catalogError} />
          )}

          {!catalogLoading && catalogError === null && filteredCatalog.length === 0 && (
            <div className="chamber-empty">
              <p data-testid="catalog-empty" className="chamber-empty-title">
                {catalogSearch.trim() !== ''
                  ? messages.catalogEmptyWithQuery(catalogSearch.trim())
                  : messages.catalogEmpty}
              </p>
              {(catalogSearch !== '' || catalogCategory !== '' || catalogCountry !== '') && (
                <>
                  <p className="chamber-empty-hint">{messages.catalogEmptyHint}</p>
                  <button
                    type="button"
                    data-testid="catalog-clear-filters"
                    className="chamber-btn chamber-btn-secondary chamber-btn-compact"
                    onClick={() => {
                      setCatalogSearch('');
                      setCatalogCategory('');
                      setCatalogCountry('');
                    }}
                  >
                    <span>{messages.clearFiltersButton}</span>
                  </button>
                </>
              )}
            </div>
          )}

          {!catalogLoading && catalogError === null && filteredCatalog.length > 0 && (
            <ul data-testid="catalog-lists" className="chamber-list">
              {filteredCatalog.map((entry) => {
                const isInstalled = installedIds.has(entry.id);
                const tagParts = [entry.tags?.country, entry.tags?.category]
                  .filter((part): part is string => typeof part === 'string' && part.length > 0)
                  .join(' · ');

                return (
                  <li
                    key={entry.id}
                    data-testid={`catalog-item-${entry.id}`}
                    className="chamber-card"
                  >
                    <div className="chamber-card-header">
                      <div className="chamber-card-heading">
                        <strong
                          data-testid={`catalog-name-${entry.id}`}
                          className="chamber-list-name"
                        >
                          <bdi>{entry.name}</bdi>
                        </strong>
                        <div className="chamber-card-submeta">
                          {tagParts !== '' && (
                            <span
                              data-testid={`catalog-tags-${entry.id}`}
                              className="chamber-card-tag-text"
                            >
                              {tagParts}
                            </span>
                          )}
                          {tagParts !== '' && (
                            <span className="chamber-card-dot" aria-hidden="true">
                              ·
                            </span>
                          )}
                          <span
                            data-testid={`catalog-rules-${entry.id}`}
                            className="chamber-card-rules-text chamber-tabular"
                          >
                            {messages.catalogRuleCount(entry.ruleCount)}
                          </span>
                        </div>
                      </div>

                      {isInstalled ? (
                        <span
                          data-testid={`catalog-installed-${entry.id}`}
                          className="chamber-badge-installed"
                        >
                          <IconCheck size={12} strokeWidth={2} />
                          <span>{messages.catalogInstalledBadge}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-testid={`catalog-install-${entry.id}`}
                          disabled={isAddingUrl}
                          onClick={() => void handleInstallCatalogEntry(entry)}
                          className="chamber-btn chamber-btn-primary chamber-btn-compact"
                        >
                          <IconDownload size={13} strokeWidth={2} />
                          <span>{messages.catalogInstallButton}</span>
                        </button>
                      )}
                    </div>

                    {entry.description !== '' && (
                      <p data-testid={`catalog-desc-${entry.id}`} className="chamber-card-desc">
                        {entry.description}
                      </p>
                    )}
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
