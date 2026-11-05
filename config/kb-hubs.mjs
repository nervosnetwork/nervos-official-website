// Existing editorial IDs/names shared by route helpers and build-time indexing.
// The const assertion preserves the TypeScript literal union without runtime IO.
export const KB_HUBS = /** @type {const} */ ([
  { id: 'blockchain-cryptography', name: 'Blockchain Cryptography' },
  { id: 'quantum-computing-blockchain-security', name: 'Quantum Computing & Blockchain Security' },
  { id: 'blockchain-architecture', name: 'Blockchain Architecture' },
  { id: 'blockchain-vms-risc-v', name: 'Blockchain VMs & RISC-V' },
  { id: 'blockchain-scalability', name: 'Blockchain Scalability' },
  { id: 'nervos-ckb', name: 'Nervos CKB' },
])
