import { LanguageSelector } from './language-selector';

export function LanguagePreferenceSlot({ placement }: {
  placement: 'app-shell' | 'school-selection' | 'no-school' | 'platform-only' | 'platform';
}) {
  return <div data-language-preference-slot={placement} className={placement === 'app-shell' ? 'shrink-0' : undefined}>
    <LanguageSelector compact={placement === 'app-shell'} />
  </div>;
}
