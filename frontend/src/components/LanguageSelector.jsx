import { useLanguage } from '../context/LanguageContext';

const flags = { en: '🇬🇧', fr: '🇫🇷', rw: '🇷🇼' };
const names = { en: 'English', fr: 'Français', rw: 'Kinyarwanda' };

export default function LanguageSelector({ className = '' }) {
  const { language, changeLanguage, t } = useLanguage();

  return (
    <div className={`lang-selector ${className}`}>
      <span className="lang-label">{t('landing_select_language')}:</span>
      <div className="lang-buttons">
        {['en', 'fr', 'rw'].map((lang) => (
          <button
            key={lang}
            onClick={() => changeLanguage(lang)}
            className={`lang-btn ${language === lang ? 'active' : ''}`}
            aria-label={`Switch to ${names[lang]}`}
            title={names[lang]}
          >
            <span className="lang-flag">{flags[lang]}</span>
            <span className="lang-name">{names[lang]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
