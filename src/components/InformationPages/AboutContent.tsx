import Image from 'next/image'
import Link from 'next/link'
import styles from './about.module.scss'

export function AboutContent() {
  return (
    <article className={styles.about} aria-label="About Nervos Network">
      <div className={styles.row}>
        <div className={styles.copy}>
          <p>
            CKB builds on Bitcoin&apos;s principles of decentralization, self-custody, and censorship resistance, and on
            two foundations of its design: Proof-of-Work mining and unspent transaction outputs (UTXOs), each with its
            own spending conditions. As with Bitcoin, anyone can run a node, verify the chain&apos;s history, and hold
            their own keys. But CKB keeps its core protocol minimal and stable, and makes everything built on top of it
            programmable. It runs general-purpose smart contracts, so developers can add new capabilities, from new
            kinds of assets to new ways of signing transactions, without a protocol upgrade.
          </p>
          <p>
            Cryptography is one of the clearest examples of that flexibility. On most blockchains, including Bitcoin,
            the network&apos;s rules define which signature schemes can authorize a payment, and adding a new one takes
            a network-wide upgrade. On CKB, anyone can deploy a new signature scheme as a program on the chain, without
            changing the network&apos;s rules, and holders can move their assets under it when they choose. This is
            known as crypto-agility.
          </p>
          <p>
            It matters because a powerful enough quantum computer could break the signature schemes that protect funds
            on most blockchains today. Since November 2025, CKB holders have been able to protect their funds with
            SPHINCS+, a post-quantum signature scheme and the basis of SLH-DSA, a standard from NIST.
          </p>
        </div>
        <figure className={styles.cryptoImage}>
          <Image
            src="/images/information-pages/about-crypto.png"
            width={420}
            height={560}
            alt="Programmable cryptography and security on CKB"
          />
        </figure>
      </div>
      <div className={styles.row}>
        <figure className={styles.riscvImage}>
          <Image
            src="/images/information-pages/about-riscv.png"
            width={420}
            height={560}
            alt="The RISC-V virtual machine and CKB Cell Model"
          />
        </figure>
        <div className={styles.copy}>
          <p>
            Two design choices make this possible. The first is CKB&apos;s Cell Model, an extension of Bitcoin&apos;s
            UTXO model. On CKB, all on-chain state is stored in cells, each with four components. Capacity represents
            the amount of CKB held in a cell and determines how much storage space it can occupy. Data can hold
            arbitrary information, from token balances to executable code. A lock script defines the conditions under
            which a cell can be spent, while an optional type script enforces additional rules, such as those governing
            the creation and transfer of tokens. Cells cannot be modified directly. Instead, transactions consume
            existing cells and create new ones, with every node verifying that the relevant scripts&apos; rules are
            satisfied. Together, these components give developers the flexibility to create new types of assets and
            define their own rules for ownership and transfer.
          </p>
          <p>
            The second is CKB-VM, the virtual machine that runs those scripts, built on RISC-V, an open instruction set
            designed for real processors rather than for one blockchain. RISC-V&apos;s base instructions are small,
            simple, and frozen, which makes the VM efficient and easier to secure, and means programs written for it
            today won&apos;t be broken by future changes to the standard. Because no cryptography is built into the VM,
            developers can write in familiar languages such as Rust and C and bring existing cryptography libraries with
            them. When CKB launched in November 2019, it was the first blockchain with a RISC-V-based smart-contract VM
            on mainnet. Polkadot has since built a RISC-V-based VM of its own, and Ethereum researchers have proposed
            one too.
          </p>
        </div>
      </div>
      <div className={styles.notes}>
        <p>
          CKB is also the settlement layer for{' '}
          <Link href="/knowledge-base/what_is_fiber" locale="en">
            Fiber
          </Link>
          , a Lightning-style payment channel network. Two parties, whether people or machines, can open a channel, make
          many small, instant payments through it at extremely low cost, and settle the final balance on CKB when they
          close it. That makes Fiber well suited to agentic commerce, where AI agents pay for data, compute, or
          services, often a fraction of a cent at a time.
        </p>
        <p>
          CKB&apos;s core developers publish their code on{' '}
          <a href="https://github.com/nervosnetwork" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          , and changes to the protocol go through public proposals called Requests for Comments (RFCs). Miners, node
          operators, researchers, and holders around the world keep the network running.
        </p>
        <p>
          The Common Knowledge Base Association (
          <a href="https://ckba.build/" target="_blank" rel="noopener noreferrer">
            CKBA
          </a>
          ) is a Swiss non-profit membership association that supports the Nervos ecosystem. Anyone with an interest in
          CKB can apply to join as a General Member, and active contributors can apply to become Contributing Members.
        </p>
      </div>
      <p>
        This website explains how CKB works and hosts the Nervos{' '}
        <Link href="/knowledge-base" locale="en">
          Knowledge Base
        </Link>
        , a free library of more than 200 articles on blockchain basics, blockchain scaling, cryptography, and quantum
        security.
      </p>
    </article>
  )
}
