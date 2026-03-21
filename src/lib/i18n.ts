import zh from '../locales/zh.json';
import en from '../locales/en.json';
import ja from '../locales/ja.json';
import { useSettingsStore, type Language } from '../stores/settingsStore';

type Messages = Record<string, string>;

const locales: Record<Language, Messages> = { zh, en, ja };

export function useTranslation() {
  const language = useSettingsStore((s) => s.language);
  const messages = locales[language];
  const t = (key: string) => messages[key] ?? key;
  return { t, language };
}
