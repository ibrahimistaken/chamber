export type Locale = 'tr' | 'en';

export interface Messages {
  readonly appTitle: string;
  readonly hiddenNotice: string;
  readonly showButton: string;
  readonly pasteListLabel: string;
  readonly pasteListPlaceholder: string;
  readonly loadListButton: string;
  readonly activeRulesSummary: (counts: {
    total: number;
    accounts: number;
    keywords: number;
    exclude: number;
  }) => string;
  readonly listLoadedSuccess: (name: string) => string;
  readonly invalidJsonError: string;
  readonly schemaErrorPrefix: string;
}

const MESSAGES: Readonly<Record<Locale, Messages>> = {
  tr: {
    appTitle: 'Chamber',
    hiddenNotice: 'Gizlendi',
    showButton: 'Göster',
    pasteListLabel: 'Liste yükle (JSON)',
    pasteListPlaceholder: '{ "id": "ornek-liste", "name": "...", ... }',
    loadListButton: 'Listeyi Yükle',
    activeRulesSummary: ({ total, accounts, keywords, exclude }) =>
      `Aktif kural: ${total} (${accounts} hesap, ${keywords} kelime, ${exclude} istisna)`,
    listLoadedSuccess: (name) => `"${name}" listesi yüklendi.`,
    invalidJsonError: 'Geçersiz JSON biçimi.',
    schemaErrorPrefix: 'Şema doğrulama hatası:',
  },
  en: {
    appTitle: 'Chamber',
    hiddenNotice: 'Hidden',
    showButton: 'Show',
    pasteListLabel: 'Load list (JSON)',
    pasteListPlaceholder: '{ "id": "example-list", "name": "...", ... }',
    loadListButton: 'Load List',
    activeRulesSummary: ({ total, accounts, keywords, exclude }) =>
      `Active rules: ${total} (${accounts} accounts, ${keywords} keywords, ${exclude} excludes)`,
    listLoadedSuccess: (name) => `Loaded list "${name}".`,
    invalidJsonError: 'Invalid JSON syntax.',
    schemaErrorPrefix: 'Schema validation error:',
  },
};

export function getMessages(locale: Locale = 'tr'): Messages {
  return MESSAGES[locale];
}
