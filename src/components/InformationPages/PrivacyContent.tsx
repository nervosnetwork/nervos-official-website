import clsx from 'clsx'
import { StyledLink } from '../StyledLink'
import styles from './content.module.scss'

export function PrivacyContent() {
  return (
    <section className={styles.privacy} aria-label="Privacy policy details">
      <section className={styles.privacyCard} aria-labelledby="privacy-collection">
        <h2 id="privacy-collection">What we collect and why</h2>
        <div className={styles.privacyGroup}>
          <h3>When you browse the site</h3>
          <p>
            We use one analytics tools to understand which pages people read and how they find them, so we can improve
            the content.
          </p>
        </div>
        <div className={styles.privacyGroup}>
          <h3>Google Analytics 4</h3>
          <div className={styles.privacyParagraphs}>
            <p>
              Records the pages you visit, roughly where you are (country and city level), your device and browser type,
              and the site that sent you here. It sets cookies in your browser so it can tell a returning visitor from a
              new one. Google processes this data on its servers, which may be outside your country.
            </p>
            <p>
              Both tools also record a small number of actions on the Knowledge Base, such as clicking a footer link or
              switching an article&apos;s language, so we can see which features people use. These records don&apos;t
              include your name or email address.
            </p>
          </div>
        </div>
        <div className={styles.privacyGroup}>
          <h3>When you sign up for the newsletter</h3>
          <p>
            If you enter your email address in a newsletter form, we send it to Mailchimp, which stores our mailing list
            and sends the emails. We use your address only to send you occasional emails regarding CKB updates. Every
            email has an unsubscribe link, and unsubscribing takes you off the list.
          </p>
        </div>
        <div className={styles.privacyGroup}>
          <h3>When the site loads</h3>
          <p>
            The site is hosted by Vercel. Like most web hosts, Vercel keeps short-lived server logs, including IP
            addresses, to deliver pages and protect the site from abuse.
          </p>
        </div>
        <div className={styles.privacyGroup}>
          <h3>Settings saved in your browser</h3>
          <p className={styles.narrowParagraph}>
            The Knowledge Base remembers a few choices in your browser&apos;s local storage: your preferred article
            language, and which version of a page layout you see while we test design changes. These stay on your
            device. You can clear them at any time in your browser settings.
          </p>
        </div>
      </section>

      <section className={styles.privacyCard} aria-labelledby="privacy-no-sale">
        <h2 id="privacy-no-sale">What we don&apos;t do</h2>
        <p>
          We don&apos;t sell your information, and we don&apos;t use it for advertising. The site has no accounts or
          <br />
          logins, and it never asks for wallet addresses, private keys, or seed phrases.
        </p>
      </section>

      <section className={clsx(styles.privacyCard, styles.compactCard)} aria-labelledby="privacy-retention">
        <h2 id="privacy-retention">How long we keep it</h2>
        <ul className={styles.policyList}>
          <li>Google Analytics data: 2 months.</li>
          <li>Newsletter list: until you unsubscribe or ask us to remove you.</li>
          <li>Hosting logs: as long as Vercel keeps them, usually a short period.</li>
        </ul>
      </section>

      <section className={clsx(styles.privacyCard, styles.compactCard)} aria-labelledby="privacy-choices">
        <h2 id="privacy-choices">Your choices and rights</h2>
        <ul className={styles.policyList}>
          <li>
            <strong>Analytics cookies:</strong> you can block or delete cookies in your browser, or install
            Google&apos;s opt-out add-on at{' '}
            <StyledLink className={styles.subtleLink} href="https://tools.google.com/dlpage/gaoptout" icon={false}>
              tools.google.com/dlpage/gaoptout
            </StyledLink>
            . The site works normally without them.
          </li>
          <li>
            <strong>Newsletter:</strong> use the unsubscribe link in any email.
          </li>
          <li>
            <strong>Your data:</strong> depending on where you live, including the EU, UK, and Switzerland, you can ask
            to see the personal data we hold about you, correct it, or have it deleted. Email us at{' '}
            <StyledLink className={styles.textLink} href="mailto:media@nervos.org" icon={false}>
              media@nervos.org
            </StyledLink>
            .
          </li>
        </ul>
      </section>

      <section className={styles.privacyCard} aria-labelledby="privacy-updates">
        <h2 id="privacy-updates">Changes to this policy</h2>
        <p className={styles.narrowParagraph}>
          If we change how we handle information, we&apos;ll update this page and the date at the top.
        </p>
      </section>

      <section className={styles.privacyCard} aria-labelledby="privacy-contact">
        <h2 id="privacy-contact">Contact</h2>
        <p className={styles.narrowParagraph}>
          Questions about this policy:{' '}
          <StyledLink className={styles.textLink} href="/contact" locale="en" icon={false}>
            nervos.org/contact
          </StyledLink>
        </p>
      </section>
    </section>
  )
}
