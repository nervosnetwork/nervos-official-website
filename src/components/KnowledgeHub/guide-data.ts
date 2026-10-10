// Titles follow the editorial feedback; body copy remains transcribed from Figma.
export const guideSteps = [
  {
    id: 'step-1',
    title: 'What is Nervos CKB?',
    summary:
      'In one line: Nervos CKB, the “Common Knowledge Base”, is a Layer 1 blockchain secured by Proof-of-Work and built on a RISC-V virtual machine, designed to be the most flexible and interoperable foundation in crypto.',
    body: 'Most blockchains lock you into one signature scheme and one smart-contract language. CKB takes a different route. It stores “common knowledge” (state everyone agrees on) in a simple, general model called Cells, and it runs a RISC-V virtual machine, the same open instruction set used in real hardware. That means CKB isn’t opinionated about cryptography or logic; almost anything can be built on top.',
    points: [
      'CKB is the Layer 1 of the Nervos Network; CKB is also the token.',
      'Secured by Proof-of-Work, the same consensus family as Bitcoin.',
      'The Cell model is a general form of Bitcoin’s UTXO, flexible enough for any asset or app.',
    ],
    reading: ['secp256k1, explained', 'Unbreakable? How SHA-256 works', 'Unbreakable? How SHA-256 works'],
  },
  {
    id: 'step-2',
    title: 'Why it’s built differently?',
    summary:
      'The short version: CKB refuses the usual trade-off. It keeps Proof-of-Work security and stays fully programmable, because its RISC-V VM supports every cryptographic primitive and gives it account abstraction by default.',
    body: 'Three design choices set CKB apart:',
    points: [
      'Proof-of-Work: battle-tested security and decentralization that resist capture, rather than trading them away for speed.',
      '“Build on hardware, not software”: the RISC-V VM runs low-level instructions, so developers aren’t boxed in by a fixed smart-contract language.',
      'Account abstraction by default: CKB doesn’t hard-code one signature scheme, so wallets and apps define their own rules for a smoother experience.',
    ],
    reading: ['secp256k1, explained', 'Unbreakable? How SHA-256 works'],
  },
  {
    id: 'step-3',
    title: 'What it makes possible',
    summary:
      'The idea: CKB is positioned as the “Contract Kernel of Bitcoin.” Through RGB++, the UTXO Stack and the Fiber payment network, it adds programmability and scale to Bitcoin, without cross-chain bridges.',
    body: 'Bitcoin is secure but deliberately limited. Bridging its assets to other chains has caused some of crypto’s biggest hacks. CKB’s answer is RGB++ and client-side validation: because CKB shares Bitcoin’s UTXO-style model, assets and logic can be tied to Bitcoin without handing custody to a bridge. Fiber then adds Lightning-style instant payments on top.',
    points: [
      'RGB++: issue and move assets that settle against Bitcoin, no bridge required.',
      'Fiber: an open, Lightning-style payment network for fast, cheap transfers.',
      'Same UTXO DNA means CKB and Bitcoin fit together naturally.',
    ],
    reading: ['secp256k1, explained', 'Unbreakable? How SHA-256 works', 'Unbreakable? How SHA-256 works'],
  },
  {
    id: 'step-4',
    title: 'Crypto-Agile & Quantum Ready',
    summary:
      'Why CKB is ready: the real quantum problem isn’t just resistance. It’s whether a chain can change its cryptography without a hard fork. CKB can. That property is called crypto agility.',
    body: 'A powerful enough quantum computer could one day break the signatures (ECDSA over secp256k1) that Bitcoin and Ethereum rely on. Swapping those out usually needs a contentious hard fork and a governance vote. On CKB, because the RISC-V VM supports all cryptographic primitives, a post-quantum scheme can be adopted as ordinary code. Quantum Purse, a community-built wallet using the post-quantum SPHINCS+ scheme, proved it: no fork, no vote, no protocol change.',
    points: [
      'Neither Bitcoin nor Ethereum is quantum resistant today.',
      'CKB can adopt post-quantum cryptography as regular code. That’s crypto agility.',
      'Quantum Purse (SPHINCS+) demonstrated it live, with no protocol change.',
    ],
    reading: ['secp256k1, explained', 'Unbreakable? How SHA-256 works', 'Unbreakable? How SHA-256 works'],
  },
]
