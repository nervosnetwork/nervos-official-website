import Link from 'next/link'
import { type ComponentProps, useSyncExternalStore } from 'react'
import { articlePath, type KBArticle } from './content'
import {
  articleLinkHref,
  articleLinkLanguage,
  getArticleLanguagePreference,
  resolveArticleContentLink,
  subscribeArticleLanguagePreference,
  type ArticleLanguagesById,
} from './article-language'

export { setArticleLanguagePreference } from './article-language'

const serverPreference = () => null

export function useArticleLanguagePreference() {
  return useSyncExternalStore(subscribeArticleLanguagePreference, getArticleLanguagePreference, serverPreference)
}

type ArticleLanguageLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  article?: KBArticle
  href?: ComponentProps<typeof Link>['href']
}

export function ArticleLanguageLink({ article, href, ...props }: ArticleLanguageLinkProps) {
  const preference = useArticleLanguagePreference()
  if (!article) return <Link {...props} href={href ?? '/knowledge-base/articles'} locale="en" />
  const target = href ?? articlePath(article)
  const localizedHref =
    typeof target === 'string'
      ? articleLinkHref(target)
      : { ...target, pathname: target.pathname ? articleLinkHref(target.pathname) : target.pathname }
  return (
    <Link
      {...props}
      href={localizedHref}
      locale={articleLinkLanguage(preference, article.language, article.availableLanguages)}
    />
  )
}

type ArticleContentLinkProps = ComponentProps<'a'> & {
  languagesByArticle: ArticleLanguagesById
  currentLanguage?: string
}

export function ArticleContentLink({
  href,
  languagesByArticle,
  currentLanguage = 'en',
  ...props
}: ArticleContentLinkProps) {
  const preference = useArticleLanguagePreference()
  const target = href ? resolveArticleContentLink(href, preference, currentLanguage, languagesByArticle) : null
  return target ? <Link {...props} href={target.href} locale={target.locale} /> : <a {...props} href={href} />
}
