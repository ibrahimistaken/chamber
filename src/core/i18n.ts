export type Locale = 'tr' | 'en';

export interface Messages {
  readonly hiddenNotice: string;
  readonly showButton: string;
}

const MESSAGES: Readonly<Record<Locale, Messages>> = {
  tr: {
    hiddenNotice: 'Gizlendi',
    showButton: 'Göster',
  },
  en: {
    hiddenNotice: 'Hidden',
    showButton: 'Show',
  },
};

export function getMessages(locale: Locale = 'tr'): Messages {
  return MESSAGES[locale];
}

