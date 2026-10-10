import { ComponentProps, forwardRef, ReactNode } from 'react'
import { clsx } from 'clsx'
import { useRouter } from 'next/router'
import { Footer, FooterProps } from '../Footer'
import { Header, HeaderProps } from '../Header'
import styles from './index.module.scss'
import { OGProperties, OpenGraph } from '../OpenGraph'
import { PRODUCTION_SITE_ORIGIN, sharingPageUrl } from '../../utils/sharing-urls'

type PageProps = Omit<ComponentProps<'div'>, 'children'> & {
  children?:
    | ReactNode
    | ((opts: {
        renderHeader: (props?: HeaderProps) => ReactNode
        renderFooter: (props?: FooterProps) => ReactNode
      }) => JSX.Element | undefined)
  openGraph?: OGProperties | ((props: OGProperties) => OGProperties)
}

const defaultOpenGraph: OGProperties = {
  type: 'website',
  title: 'Nervos Network',
  description:
    'The Nervos Network is a flexible blockchain platform, secured by proof of work, which allows developers freedom of choice in cryptographic primitives and decentralized application architecture.',
  url: PRODUCTION_SITE_ORIGIN,
  site_name: 'Nervos Network',
  twitter: {
    card: 'summary_large_image',
    site: '@NervosNetwork',
  },
  image: {
    url: `${PRODUCTION_SITE_ORIGIN}/images/logo.png`,
  },
}

export const Page = forwardRef<HTMLDivElement, PageProps>(function Page(props, ref) {
  const { openGraph, children, className, ...divProps } = props
  const router = useRouter()
  const pageOpenGraph = {
    ...defaultOpenGraph,
    url: sharingPageUrl(router.asPath, router.locale, router.defaultLocale),
  }

  const finalChildren = (
    <>
      <OpenGraph
        properties={typeof openGraph === 'function' ? openGraph(pageOpenGraph) : (openGraph ?? pageOpenGraph)}
      />

      {typeof children === 'function' ? (
        children({
          renderHeader: props => <Header {...props} />,
          renderFooter: props => <Footer {...props} />,
        })
      ) : (
        <>
          <Header />
          {children}
          <Footer />
        </>
      )}
    </>
  )

  return (
    <div ref={ref} className={clsx(styles.page, className)} {...divProps}>
      {finalChildren}
    </div>
  )
})
