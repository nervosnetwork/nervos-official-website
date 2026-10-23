type GuideStep = {
  id: string
  title: string
  navTitle: string
  summary: string
  body: string
  points: string[]
  reading: string[]
  actions?: { title: string; description: string; label: string; href: string; resourceId: string }[]
}

export const guideSteps: GuideStep[] = [
  {
    id: 'step-1',
    title: 'What is Nervos CKB?',
    navTitle: 'What is Nervos CKB?',
    summary:
      'Built on RISC-V and secured by Proof-of-Work, CKB is the most cryptographically flexible and programmable UTXO-based chain.',
    body: 'CKB was built around a conviction: a blockchain should remain useful as technology evolves, without giving up the principles that make it worth using. Its ambition is to carry Bitcoin’s resilience, openness, and independent verifiability into a broader world of applications, where developers can define their own rules and users retain control over the digital assets and systems they depend on.',
    points: [
      'The Blockchain: CKB stands for Common Knowledge Base, the Layer 1 of the Nervos Network.',
      'The Token: CKB is the native currency, used to pay transaction fees and occupy on-chain storage.',
      'The Network: Nervos is a growing set of standards and protocols built around CKB.',
    ],
    reading: [],
  },
  {
    id: 'step-2',
    title: 'Why it’s built differently?',
    navTitle: 'Why it’s built differently',
    summary:
      'CKB is built to let applications and cryptography evolve independently of the core protocol. Developers can introduce new features, signature schemes, and ownership rules without requiring a network-wide upgrade, keeping the foundation stable while expanding what can be built on it.',
    body: 'Three design choices set CKB apart:',
    points: [
      'The Cell Model: Bitcoin’s UTXOs, extended to hold assets, data, and code, with programmable rules governing how they can be used.',
      'A RISC-V VM: Built on an open instruction set used in real processors, CKB can run application logic and cryptographic libraries compiled for RISC-V.',
      'Native Account Abstraction: Each Cell defines how access is authorized, enabling wallets and apps to support passkeys, multiple signatures, and post-quantum schemes.',
    ],
    reading: [],
  },
  {
    id: 'step-3',
    title: 'What it makes possible',
    navTitle: 'CKB & Bitcoin',
    summary:
      'CKB’s flexibility translates into new ways to secure assets, build payment networks, and connect blockchains. Developers can put these ideas into practice on the same underlying foundation.',
    body: 'From the keys that protect your assets to the networks that move them, here’s what that freedom enables:',
    points: [
      'Flexible security: From Quantum Purse’s post-quantum signatures to JoyID’s passkeys, developers can choose how users secure and access their assets.',
      'Novel Layer 2s: Fiber extends Lightning’s payment-channel model with more expressive channels supporting multiple assets, native swaps, and cross-chain payments.',
      'Interoperability: CKB can link asset ownership to another blockchain while enforcing the asset’s rules on CKB, as RGB++ demonstrates with Bitcoin.',
    ],
    reading: [],
  },
  {
    id: 'step-4',
    title: 'Crypto-Agile & Quantum-Ready',
    navTitle: 'Quantum & crypto agility',
    summary: 'CKB is the only crypto-agile blockchain in existence today.',
    body: 'Security shouldn’t be limited to the cryptography a blockchain launched with. CKB can support new signature schemes, including post-quantum alternatives, without changing its core protocol, giving developers the freedom to prepare for emerging threats.',
    points: [
      'Crypto-Agility by Design: Signature schemes live in programmable scripts, so anyone can deploy or use new ones without waiting for soft or hard forks.',
      'Post-Quantum Protection Today: SPHINCS+ is available on CKB and used by the Quantum Purse wallet.',
      'Ready For What Comes Next: As better post-quantum schemes emerge, developers can add them through the same process, without seeking permission.',
    ],
    reading: [],
  },
  {
    id: 'step-5',
    title: 'Make your next move',
    navTitle: 'Try it & build',
    summary:
      'You’ve seen what makes CKB different. Now explore what people are building, meet the community, or start building something of your own.',
    body: 'You don’t have to read everything. The fastest way to make CKB click is to try it out.',
    points: [],
    reading: [],
    actions: [
      {
        title: 'Explore the ecosystem',
        description: 'Find wallets, apps, and tools that put CKB’s capabilities into practice.',
        label: 'Explore CKB',
        href: 'https://ckbdapps.com/ecosystem',
        resourceId: 'ecosystem',
      },
      {
        title: 'Join the conversation',
        description: 'Ask questions, exchange ideas, and meet the people shaping Nervos.',
        label: 'Visit NervosTalk',
        href: 'https://talk.nervos.org/',
        resourceId: 'community',
      },
      {
        title: 'Build on CKB',
        description: 'Go from understanding the architecture to writing your first application.',
        label: 'Developer Docs & Quick Start',
        href: 'https://docs.nervos.org/',
        resourceId: 'developer_docs',
      },
    ],
  },
]
