export type Locale = 'tr' | 'en';

export interface RuleCounts {
  readonly total: number;
  readonly accounts: number;
  readonly keywords: number;
  readonly exclude: number;
  readonly scoped: number;
}

export interface Messages {
  readonly appTitle: string;
  readonly hiddenNotice: string;
  readonly showButton: string;
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
