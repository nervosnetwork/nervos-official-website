import clsx from 'clsx'
import Link from 'next/link'
import { articlePath, type KBArticle } from './content'
import { setArticleLanguagePreference } from './ArticleLanguageLink'
import styles from './article-language.module.scss'

// Figma Language Toggle 3359:877 / 3359:879. Only real EN/ZH translations
// are offered here; existing links to other translated articles still work.
export function ArticleLanguageSwitch({ article, mobile = false }: { article: KBArticle; mobile?: boolean }) {
  const languages = (['en', 'zh'] as const).filter(language =>
    (article.availableLanguages ?? [article.language]).includes(language),
  )
  if (!languages.length) return null

  return (
    <nav className={clsx(styles.switch, mobile && styles.mobile)} aria-label="Article language">
      {languages.map(language => (
        <Link
          key={language}
          href={articlePath(article)}
          locale={language}
          hrefLang={language}
          lang={language}
          aria-label={language === 'en' ? 'Read in English' : '阅读中文版'}
          aria-current={article.language === language ? 'page' : undefined}
          onClick={() => setArticleLanguagePreference(language)}
          onAuxClick={event => {
            if (event.button === 1) setArticleLanguagePreference(language)
          }}
        >
          {language === 'en' ? 'EN' : '中文'}
        </Link>
      ))}
    </nav>
  )
}
