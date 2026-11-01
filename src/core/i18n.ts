export type Locale = 'tr' | 'en';

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
  readonly catalogSearchPlaceholder: string;
  readonly catalogAllCategories: string;
  readonly catalogAllCountries: string;
  readonly catalogEmpty: string;
  readonly catalogInstallButton: string;
  readonly catalogInstalledBadge: string;
  readonly catalogRuleCount: (count: number) => string;
  readonly installedListsHeading: string;
  readonly noInstalledLists: string;
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
    catalogLoading: 'Katalog yükleniyor...',
    catalogSearchPlaceholder: 'Liste veya konu ara...',
    catalogAllCategories: 'Tüm kategoriler',
    catalogAllCountries: 'Tüm ülkeler',
    catalogEmpty: 'Eşleşen liste bulunamadı.',
    catalogInstallButton: 'Kur',
    catalogInstalledBadge: 'Kurulu',
    catalogRuleCount: (count) => `${count} kural`,
    installedListsHeading: 'Yüklü Listeler',
    noInstalledLists: 'Henüz yüklü liste yok.',
    listMetaSummary: ({ ruleCount, version, updatedAtText }) =>
      `${ruleCount} kural · v${version} · Son güncelleme: ${updatedAtText}`,
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
    catalogLoading: 'Loading catalog...',
    catalogSearchPlaceholder: 'Search lists or topics...',
    catalogAllCategories: 'All categories',
    catalogAllCountries: 'All countries',
    catalogEmpty: 'No matching lists found.',
    catalogInstallButton: 'Install',
    catalogInstalledBadge: 'Installed',
    catalogRuleCount: (count) => `${count} rules`,
    installedListsHeading: 'Installed Lists',
    noInstalledLists: 'No lists installed yet.',
    listMetaSummary: ({ ruleCount, version, updatedAtText }) =>
      `${ruleCount} rules · v${version} · Last updated: ${updatedAtText}`,
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
