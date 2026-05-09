import { createContext, useContext, useState, type ReactNode } from 'react';

export type Locale = 'zh' | 'ja' | 'en';

const LOCALE_KEY = 'rc-locale';

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(LOCALE_KEY) as Locale | null;
  if (stored && stored in { zh: 1, ja: 1, en: 1 }) return stored;
  return 'en';
}

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleCtx>({ locale: 'en', setLocale: () => {} });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);

  const persist = (l: Locale) => {
    setLocale(l);
    localStorage.setItem(LOCALE_KEY, l);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale: persist }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export type TKey = string;

export type Translations = Record<Locale, Record<TKey, string>>;

export function t(locale: Locale, dict: Translations, key: TKey, vars?: Record<string, string>): string {
  let text = dict[locale][key];
  if (!text) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}
