export type Locale = 'tr' | 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['tr', 'en'];

/** Each language is shown in its own name so users can always find theirs. */
export const LOCALE_NATIVE_NAMES: Readonly<Record<Locale, string>> = {
  tr: 'Türkçe',
  en: 'English',
};

export const LOCALE_FLAGS: Readonly<Record<Locale, string>> = {
  tr: '🇹🇷',
  en: '🇬🇧',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export interface RuleCounts {
  readonly total: number;
  readonly accounts: number;
  readonly keywords: number;
  readonly exclude: number;
  readonly scoped: number;
}

export interface ListMetaSummaryInput {
  readonly ruleCount: number;
  readonly version: number;
  readonly updatedAtText: string;
}

export interface Messages {
  readonly appTitle: string;
  readonly hiddenNotice: string;
  readonly showButton: string;
  readonly tabInstalledLists: string;
  readonly tabCatalog: string;
  readonly catalogLoading: string;
  readonly catalogSearchLabel: string;
  readonly catalogSearchPlaceholder: string;
  readonly catalogCategoryLabel: string;
  readonly catalogCountryLabel: string;
  readonly catalogAllCategories: string;
  readonly catalogAllCountries: string;
  readonly catalogEmpty: string;
  readonly catalogEmptyWithQuery: (query: string) => string;
  readonly catalogEmptyHint: string;
  readonly clearFiltersButton: string;
  readonly catalogInstallButton: string;
  readonly catalogInstalledBadge: string;
  readonly catalogRuleCount: (count: number) => string;
  readonly installedListsHeading: string;
  readonly noInstalledLists: string;
  readonly noInstalledListsHint: string;
  readonly browseCatalogButton: string;
  readonly listMetaSummary: (info: ListMetaSummaryInput) => string;
  readonly toggleListAriaLabel: (name: string) => string;
  readonly deleteListButton: string;
  readonly deleteListAriaLabel: (name: string) => string;
  readonly listErrorLabel: (error: string) => string;
  readonly addFromUrlLabel: string;
  readonly addFromUrlPlaceholder: string;
  readonly addFromUrlButton: string;
  readonly addingFromUrlStatus: string;
  readonly advancedSectionTitle: string;
  readonly pasteListLabel: string;
  readonly pasteListPlaceholder: string;
  readonly loadListButton: string;
  readonly dismissNotice: string;
  readonly settingsButtonLabel: string;
  readonly settingsBackButtonLabel: string;
  readonly settingsCloseButtonLabel: string;
  readonly settingsGeneralHeading: string;
  readonly settingsPreferencesRow: string;
  readonly settingsLanguageHeading: string;
  readonly openSourceFooterText: string;
  readonly githubLinkLabel: string;
  readonly githubLinkAriaLabel: string;
  readonly statsCardTitle: string;
  readonly statsAccountsLabel: string;
  readonly statsKeywordsLabel: string;
  readonly statsExcludeLabel: string;
  readonly statsScopedLabel: string;
  readonly activeRulesSummary: (counts: RuleCounts) => string;
  readonly listLoadedSuccess: (name: string) => string;
  readonly invalidJsonError: string;
  readonly schemaErrorPrefix: string;
}

const MESSAGES: Readonly<Record<Locale, Messages>> = {
  tr: {
    appTitle: 'Chamber',
    hiddenNotice: 'Gizlendi',
    showButton: 'Göster',
    tabInstalledLists: 'Listelerim',
    tabCatalog: 'Katalog',
    catalogLoading: 'Katalog yükleniyor…',
    catalogSearchLabel: 'Katalogda ara',
    catalogSearchPlaceholder: 'Liste veya konu ara...',
    catalogCategoryLabel: 'Kategoriye göre filtrele',
    catalogCountryLabel: 'Ülkeye göre filtrele',
    catalogAllCategories: 'Tüm kategoriler',
    catalogAllCountries: 'Tüm ülkeler',
    catalogEmpty: 'Eşleşen liste yok',
    catalogEmptyWithQuery: (query) => `"${query}" için liste bulunamadı`,
    catalogEmptyHint: 'Farklı bir kelime dene ya da filtreleri temizle.',
    clearFiltersButton: 'Filtreleri temizle',
    catalogInstallButton: 'Kur',
    catalogInstalledBadge: 'Kurulu',
    catalogRuleCount: (count) => `${count} kural`,
    installedListsHeading: 'Yüklü Listeler',
    noInstalledLists: 'Henüz liste yok',
    noInstalledListsHint: 'Kurduğun listeler burada görünür ve tek dokunuşla açılıp kapatılır.',
    browseCatalogButton: 'Kataloğa göz at',
    listMetaSummary: ({ ruleCount, version, updatedAtText }) =>
      `${ruleCount} kural · v${version} · ${updatedAtText}`,
    toggleListAriaLabel: (name) => `${name} listesini aç/kapat`,
    deleteListButton: 'Sil',
    deleteListAriaLabel: (name) => `${name} listesini sil`,
    listErrorLabel: (error) => `Hata: ${error}`,
    addFromUrlLabel: 'URL ile ekle',
    addFromUrlPlaceholder: 'https://raw.githubusercontent.com/.../liste.json',
    addFromUrlButton: 'URL Ekle',
    addingFromUrlStatus: 'Liste indiriliyor...',
    advancedSectionTitle: 'Gelişmiş',
    pasteListLabel: 'Liste yükle (JSON)',
    pasteListPlaceholder: '{ "id": "ornek-liste", "name": "...", ... }',
    loadListButton: 'Listeyi Yükle',
    dismissNotice: 'Bildirimi kapat',
    settingsButtonLabel: 'Ayarlar',
    settingsBackButtonLabel: 'Geri',
    settingsCloseButtonLabel: 'Kapat',
    settingsGeneralHeading: 'Genel',
    settingsPreferencesRow: 'Tercihler ve görüntüleme',
    settingsLanguageHeading: 'Dil',
    openSourceFooterText: 'Açık kaynak',
    githubLinkLabel: 'GitHub',
    githubLinkAriaLabel: 'Chamber GitHub deposunu yeni sekmede aç',
    statsCardTitle: 'Aktif Kural',
    statsAccountsLabel: 'Hesap',
    statsKeywordsLabel: 'Kelime',
    statsExcludeLabel: 'İstisna',
    statsScopedLabel: 'Kapsamlı',
    activeRulesSummary: ({ total, accounts, keywords, exclude, scoped }) =>
      `Aktif kural: ${total} (${accounts} hesap, ${keywords} kelime, ${exclude} istisna, ${scoped} hesaba bağlı kural)`,
    listLoadedSuccess: (name) => `"${name}" listesi yüklendi.`,
    invalidJsonError: 'Geçersiz JSON biçimi.',
    schemaErrorPrefix: 'Şema doğrulama hatası:',
  },
  en: {
    appTitle: 'Chamber',
    hiddenNotice: 'Hidden',
    showButton: 'Show',
    tabInstalledLists: 'My Lists',
    tabCatalog: 'Catalog',
    catalogLoading: 'Loading catalog…',
    catalogSearchLabel: 'Search catalog',
    catalogSearchPlaceholder: 'Search lists or topics...',
    catalogCategoryLabel: 'Filter by category',
    catalogCountryLabel: 'Filter by country',
    catalogAllCategories: 'All categories',
    catalogAllCountries: 'All countries',
    catalogEmpty: 'No matching lists',
    catalogEmptyWithQuery: (query) => `No lists for "${query}"`,
    catalogEmptyHint: 'Try another word or clear the filters.',
    clearFiltersButton: 'Clear filters',
    catalogInstallButton: 'Install',
    catalogInstalledBadge: 'Installed',
    catalogRuleCount: (count) => `${count} rules`,
    installedListsHeading: 'Installed Lists',
    noInstalledLists: 'No lists yet',
    noInstalledListsHint: 'Lists you install appear here and can be turned on or off in one tap.',
    browseCatalogButton: 'Browse catalog',
    listMetaSummary: ({ ruleCount, version, updatedAtText }) =>
      `${ruleCount} rules · v${version} · ${updatedAtText}`,
    toggleListAriaLabel: (name) => `Toggle list ${name}`,
    deleteListButton: 'Delete',
    deleteListAriaLabel: (name) => `Delete list ${name}`,
    listErrorLabel: (error) => `Error: ${error}`,
    addFromUrlLabel: 'Add from URL',
    addFromUrlPlaceholder: 'https://raw.githubusercontent.com/.../list.json',
    addFromUrlButton: 'Add URL',
    addingFromUrlStatus: 'Downloading list...',
    advancedSectionTitle: 'Advanced',
    pasteListLabel: 'Load list (JSON)',
    pasteListPlaceholder: '{ "id": "example-list", "name": "...", ... }',
    loadListButton: 'Load List',
    dismissNotice: 'Dismiss notification',
    settingsButtonLabel: 'Settings',
    settingsBackButtonLabel: 'Back',
    settingsCloseButtonLabel: 'Close',
    settingsGeneralHeading: 'General',
    settingsPreferencesRow: 'Preferences & display',
    settingsLanguageHeading: 'Language',
    openSourceFooterText: 'Open source',
    githubLinkLabel: 'GitHub',
    githubLinkAriaLabel: 'Open Chamber GitHub repository in a new tab',
    statsCardTitle: 'Active Rules',
    statsAccountsLabel: 'Accounts',
    statsKeywordsLabel: 'Keywords',
    statsExcludeLabel: 'Excludes',
    statsScopedLabel: 'Scoped',
    activeRulesSummary: ({ total, accounts, keywords, exclude, scoped }) =>
      `Active rules: ${total} (${accounts} accounts, ${keywords} keywords, ${exclude} excludes, ${scoped} scoped rules)`,
    listLoadedSuccess: (name) => `Loaded list "${name}".`,
    invalidJsonError: 'Invalid JSON syntax.',
    schemaErrorPrefix: 'Schema validation error:',
  },
};

export function getMessages(locale: Locale = 'tr'): Messages {
  return MESSAGES[locale];
}
