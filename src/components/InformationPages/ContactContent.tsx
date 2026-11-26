import Image from 'next/image'
import { StyledLink } from '../StyledLink'
import styles from './content.module.scss'

export function ContactContent() {
  return (
    <section className={styles.contact} aria-label="Contact channels">
      <article className={styles.contactCard} aria-labelledby="contact-news">
        <div className={styles.contactIllustration}>
          <Image
            className={styles.newsImage}
            src="/images/information-pages/contact-news.png"
            width={343}
            height={150}
            alt=""
          />
        </div>
        <h2 id="contact-news">News and announcements</h2>
        <p>
          Official updates come from @NervosNetwork on X:
          <br />
          <StyledLink className={styles.textLink} href="https://x.com/NervosNetwork" icon={false}>
            x.com/NervosNetwork
          </StyledLink>
        </p>
      </article>

      <article className={styles.contactCard} aria-labelledby="contact-ckba">
        <div className={styles.contactIllustration}>
          <Image
            className={styles.joinImage}
            src="/images/information-pages/contact-join.png"
            width={348}
            height={152}
            alt=""
          />
        </div>
        <h2 id="contact-ckba">Joining CKBA</h2>
        <p>
          CKBA, the non-profit that supports the CKB ecosystem, takes membership applications and general questions
          through the form at{' '}
          <StyledLink className={styles.textLink} href="https://ckba.build/" icon={false}>
            ckba.build
          </StyledLink>
        </p>
      </article>

      <article className={styles.contactCard} aria-labelledby="contact-community">
        <div className={styles.contactIllustration}>
          <Image
            className={styles.communityImage}
            src="/images/information-pages/contact-community.png"
            width={283}
            height={150}
            alt=""
          />
        </div>
        <h2 id="contact-community">Community discussion</h2>
        <p>
          Proposals and longer questions go to the{' '}
          <StyledLink className={styles.textLink} href="https://talk.nervos.org/" icon={false}>
            Nervos Talk forum
          </StyledLink>
          , where answers stay searchable for the next person. For quicker back-and-forth, the community chats on{' '}
          <StyledLink className={styles.textLink} href="https://discord.gg/FKh8Zzvwqa" icon={false}>
            Discord
          </StyledLink>{' '}
          and{' '}
          <StyledLink className={styles.textLink} href="https://t.me/NervosNetwork" icon={false}>
            Telegram
          </StyledLink>
          .
        </p>
      </article>

      <article className={styles.contactCard} aria-labelledby="contact-developers">
        <div className={styles.contactIllustration}>
          <Image
            className={styles.developersImage}
            src="/images/information-pages/contact-developers.png"
            width={360}
            height={158}
            alt=""
          />
        </div>
        <h2 id="contact-developers">Developers</h2>
        <p>
          The technical documentation lives at{' '}
          <StyledLink className={styles.textLink} href="https://docs.nervos.org/" icon={false}>
            docs.nervos.org.
          </StyledLink>{' '}
          Bugs and code questions go to GitHub:{' '}
          <StyledLink className={styles.textLink} href="https://github.com/nervosnetwork" icon={false}>
            github.com/nervosnetwork
          </StyledLink>
        </p>
      </article>

      <article className={styles.contactCard} aria-labelledby="contact-press">
        <div className={styles.contactIllustration}>
          <Image
            className={styles.pressImage}
            src="/images/information-pages/contact-press.png"
            width={343}
            height={147}
            alt=""
          />
        </div>
        <h2 id="contact-press">Press and brand assets</h2>
        <p>
          Logos and brand guidelines are on the media kit page:{' '}
          <StyledLink className={styles.textLink} href="/media-kit" locale="en" icon={false}>
            nervos.org/media-kit
          </StyledLink>
        </p>
      </article>

      <article className={styles.contactCard} aria-labelledby="contact-safety">
        <div className={styles.contactIllustration}>
          <Image
            className={styles.safetyImage}
            src="/images/information-pages/contact-safety.png"
            width={359}
            height={157}
            alt=""
          />
        </div>
        <h2 id="contact-safety">Stay safe</h2>
        <p>
          Scammers sometimes pose as Nervos or CKBA staff. Nobody from Nervos Network or CKBA will ask for your private
          key, seed phrase, or password, or message you first with an investment offer. Trust only links that come from
          the channels on this page.
        </p>
      </article>
    </section>
  )
}
