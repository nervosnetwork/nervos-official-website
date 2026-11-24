type GuideStep = {
  id: string
  title: string
  navTitle: string
  summary: string
  body: string
  points: string[]
  reading: string[]
  actions?: { title: string; description: string; label: string; href: string; resourceId: string; icon: string }[]
}

export const guideSteps: GuideStep[] = [
  {
    id: 'step-1',
    title: 'What is CKB?',
    navTitle: 'What is CKB?',
    summary:
      "CKB is a blockchain that builds on Bitcoin's principles of decentralization, self-custody, and censorship resistance, and carries them to a broader range of digital assets and applications. It extends Bitcoin's UTXO model with a general-purpose RISC-V virtual machine, giving developers the freedom to define new assets, customize ownership rules, and introduce new cryptographic schemes, including post-quantum ones, without changing the underlying protocol.",
    body: '',
    points: [
      'The Blockchain: CKB, short for Common Knowledge Base, is a Layer 1 blockchain: the base layer that apps, tokens, and Layer 2 networks build on.',
      "The Token: $CKB is the chain's native token. It pays transaction fees, and holding it reserves space on-chain: one CKB stores one byte of data.",
      'The Network: The Nervos Network is the wider ecosystem of protocols, tools, and projects built around CKB, from payment channels to Bitcoin-linked assets.',
    ],
    reading: [],
  },
  {
    id: 'step-2',
    title: 'Built Differently',
    navTitle: 'Built Differently',
    summary:
      'Most blockchains embed much of their functionality directly into their core protocols, making changes or extensions difficult without network-wide upgrades. CKB takes a different approach: it deliberately keeps its core protocol minimal and stable, while making the functionality built on top of it highly programmable, extensible, and open to permissionless innovation. Three design choices make that possible:',
    body: '',
    points: [
      "The Cell Model: Bitcoin's UTXOs, extended. Each cell can hold assets, data, or code, with programmable rules for how it can be used.",
      "RISC-V VM: CKB's virtual machine uses RISC-V, an open, simple, and stable instruction set that lets developers build with battle-tested languages, compilers, and libraries.",
      'Native Account Abstraction: Every cell is guarded by a program called a lock script, so wallets can let people approve transactions the way they unlock everyday apps, with a fingerprint or face scan.',
    ],
    reading: [],
  },
  {
    id: 'step-3',
    title: 'What It Makes Possible',
    navTitle: 'What It Makes Possible',
    summary:
      "Because so much of CKB is programmable, developers can change how assets are secured, how payments move, and how blockchains connect, all on the same foundation. Here's what that looks like in practice:",
    body: '',
    points: [
      "Flexible Security: From Quantum Purse's post-quantum signatures to JoyID's passkeys, developers can choose how users secure and access their assets.",
      "Novel Layer 2s: Fiber extends Lightning's payment-channel model with more expressive channels supporting multiple assets, native swaps, and cross-chain payments.",
      "Interoperability: CKB can link asset ownership to another blockchain while enforcing the asset's rules on CKB, as RGB++ demonstrates with Bitcoin.",
    ],
    reading: [],
  },
  {
    id: 'step-4',
    title: 'Quantum-Ready via Crypto-Agility',
    navTitle: 'Quantum-Ready via Crypto-Agility',
    summary: 'CKB has been crypto-agile by design since its mainnet launch in 2019.',
    body: 'Many blockchains are tied to the cryptography they launched with. Changing it takes a network-wide upgrade, and getting thousands of independent participants to agree can take years. On CKB, signature schemes are ordinary programs, so new ones, including post-quantum schemes, can be added at any time, as software.',
    points: [
      'Crypto-Agility by Design: Signature schemes live in lock scripts, so anyone can deploy a new one, or start using one, without waiting for a fork.',
      'Post-Quantum Protection Today: A post-quantum lock built on SPHINCS+, a NIST-standardized signature scheme, is live on CKB mainnet, and the Quantum Purse wallet already uses it.',
      "Ready for What Comes Next: No cryptography lasts forever. When better schemes arrive, or today's weaken, developers can add new ones the same way, without anyone's permission.",
    ],
    reading: [],
  },
  {
    id: 'step-5',
    title: 'Make Your Next Move',
    navTitle: 'Make Your Next Move',
    summary:
      "You've seen what makes CKB different. Now the fastest way to make it click is to dive in: see what people are building, meet the community, or start building yourself.",
    body: '',
    points: [],
    reading: [],
    actions: [
      {
        title: 'Explore the Ecosystem',
        description: "Find the wallets, apps, and tools that already put CKB's capabilities to work.",
        label: 'Explore CKB',
        href: 'https://ckbdapps.com/ecosystem',
        resourceId: 'ecosystem',
        icon: 'subject-ckb-architecture',
      },
      {
        title: 'Join the Conversation',
        description:
          'Ask questions, swap ideas, and meet the people shaping the Nervos Network on Nervos Talk, its community forum.',
        label: 'Visit Nervos Talk',
        href: 'https://talk.nervos.org/',
        resourceId: 'community',
        icon: 'action-community',
      },
      {
        title: 'Build on CKB',
        description:
          'Go from understanding the architecture to writing your first application with the developer docs and quick-start guides.',
        label: 'Developer Docs & Quick Start',
        href: 'https://docs.nervos.org/',
        resourceId: 'developer_docs',
        icon: 'subject-opcodes',
      },
    ],
  },
]
