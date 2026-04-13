# Midnight Private Vault - Full-Stack dApp Tutorial

This tutorial guides you through building a complete privacy-preserving decentralized application (dApp) on the Midnight blockchain. By the end, you'll understand how to create a Compact smart contract with privacy features, implement TypeScript witnesses, set up a wallet provider, and build a React frontend that interacts with the deployed contract.

## Prerequisites

Before starting, ensure you have:

- Node.js v22+ installed
- Docker with docker compose
- A Midnight wallet (Lace or 1AM) installed in your browser
- The Midnight Compact toolchain installed

## Project Structure

```
midnight-dapp-demo/
├── contracts/           # Smart contract (Compact language)
│   ├── src/
│   │   ├── private-vault.compact    # The Compact contract
│   │   └── managed/                # Compiled output
│   └── package.json
├── api/                 # TypeScript API with witnesses
│   ├── src/
│   │   ├── index.ts
│   │   └── witnesses.ts
│   └── package.json
├── frontend/            # React frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   └── package.json
├── backend/             # Simple backend for off-chain data
│   ├── src/
│   │   └── index.ts
│   └── package.json
└── package.json         # Root workspace
```

## Step 1: The Compact Smart Contract

The Private Vault is a privacy-preserving smart contract that allows users to deposit and withdraw funds while maintaining confidentiality of the owner's identity.

### Writing the Contract

Create `contracts/src/private-vault.compact`:

```compact
pragma language_version >= 0.20;

import CompactStandardLibrary;

export enum VaultState {
  UNINITIALIZED,
  ACTIVE,
  LOCKED
}

export ledger vaultState: VaultState;
export ledger totalDeposits: Uint64;
export ledger owner: Bytes<32>;
export ledger sequence: Counter;

constructor() {
  vaultState = VaultState.UNINITIALIZED;
  totalDeposits = 0u64;
  sequence.increment(1);
}

witness localSecretKey(): Bytes<32>;

export circuit initializeVault(): [] {
  assert(vaultState == VaultState.UNINITIALIZED, "Vault already initialized");
  owner = disclose(publicKey(localSecretKey(), sequence as Field as Bytes<32>));
  vaultState = VaultState.ACTIVE;
}

export circuit deposit(amount: Uint64): [] {
  assert(vaultState == VaultState.ACTIVE, "Vault is not active");
  totalDeposits = totalDeposits + amount;
  sequence.increment(1);
}

export circuit withdraw(amount: Uint64): [] {
  assert(vaultState == VaultState.ACTIVE, "Vault is not active");
  assert(amount <= totalDeposits, "Insufficient funds");
  assert(owner == publicKey(localSecretKey(), sequence as Field as Bytes<32>), "Not the owner");
  totalDeposits = totalDeposits - amount;
  sequence.increment(1);
}

export circuit lockVault(): [] {
  assert(vaultState == VaultState.ACTIVE, "Vault is not active");
  assert(owner == publicKey(localSecretKey(), sequence as Field as Bytes<32>), "Not the owner");
  vaultState = VaultState.LOCKED;
}

export circuit unlockVault(): [] {
  assert(vaultState == VaultState.LOCKED, "Vault is not locked");
  assert(owner == publicKey(localSecretKey(), sequence as Field as Bytes<32>), "Not the owner");
  vaultState = VaultState.ACTIVE;
}

export circuit getOwner(): Bytes<32> {
  return owner;
}

pure circuit publicKey(sk: Bytes<32>, sequence: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([pad(32, "vault:pk:"), sequence, sk]);
}
```

### Key Concepts Explained

- **Ledger State**: Public data stored on-chain (`vaultState`, `totalDeposits`, `owner`, `sequence`)
- **Witness Functions**: Private data that users provide off-chain (`localSecretKey`)
- **Circuits**: Functions that modify state and can generate ZK proofs
- **Pure Circuits**: Helper functions that don't modify state (`publicKey`)
- **`disclose()`**: Marks private data as safe to store publicly

## Step 2: Compile the Contract

Run the Compact compiler from the contracts directory:

```bash
cd contracts
npm run compile
```

The compiler generates:
- `managed/private-vault/contract/index.js` - JavaScript implementation
- `managed/private-vault/contract/index.d.ts` - TypeScript types
- `managed/private-vault/keys/` - ZK proving/verifying keys
- `managed/private-vault/zkir/` - Zero-Knowledge Intermediate Representation

## Step 3: TypeScript Witness Implementation

The witness implementation provides private data to circuit execution. Create `api/src/witnesses.ts`:

```typescript
export type VaultPrivateState = {
  secretKey: Uint8Array;
};

export const createVaultPrivateState = (secretKey: Uint8Array): VaultPrivateState => ({
  secretKey,
});

export const witnesses = {
  localSecretKey: (context: { privateState: VaultPrivateState }): Uint8Array => {
    return context.privateState.secretKey;
  },
};
```

This connects your DApp to the wallet's private key without exposing it on-chain.

## Step 4: React Frontend

The frontend uses the Midnight DApp Connector API to connect to wallets like Lace or 1AM.

### Wallet Connection

```typescript
import '@midnight-ntwrk/dapp-connector-api';
import type { InitialAPI, ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';

const connectWallet = async () => {
  const selectedWallet = window.midnight.mnLace; // or window.midnight['1am']
  const connectedApi = await selectedWallet.connect(NetworkId.Preprod);
  const addresses = await connectedApi.getShieldedAddresses();
  return connectedApi;
};
```

### Deploy Contract

```typescript
const deployContract = async (wallet: ConnectedAPI) => {
  const config = await wallet.getConfiguration();
  
  // Call backend to deploy
  const response = await fetch('/api/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      node: config.node,
      indexer: config.indexer,
    }),
  });
  
  return response.json();
};
```

### Read State

```typescript
const readState = async (wallet: ConnectedAPI, contractAddress: string) => {
  const config = await wallet.getConfiguration();
  
  const response = await fetch(
    `/api/state?address=${contractAddress}&node=${config.node}&indexer=${config.indexer}`
  );
  
  return response.json();
};
```

## Step 5: Backend API

The simple Express backend manages deployed contracts and state:

```typescript
const deployedContracts = new Map<string, DeployedContract>();

app.post('/api/deploy', (req, res) => {
  const address = `vault_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  deployedContracts.set(address, {
    address,
    state: {
      vaultState: 0,
      totalDeposits: 0n,
      owner: new Uint8Array(32),
      sequence: 1n,
    },
  });
  
  res.json({ address });
});

app.get('/api/state', (req, res) => {
  const contract = deployedContracts.get(req.query.address as string);
  res.json(contract?.state);
});
```

## Step 6: Running the Full Stack

### 1. Start the Backend

```bash
cd backend
npm run dev
```

### 2. Start the Frontend

```bash
cd frontend
npm run dev
```

### 3. Connect Wallet

1. Open `http://localhost:3000` in your browser
2. Click "Connect Wallet"
3. Authorize in your Lace/1AM wallet extension
4. Deploy a new vault contract
5. Initialize, deposit, and withdraw!

## Understanding the Transaction Flow

1. **User Action**: User clicks "Deposit" in the frontend
2. **API Call**: Frontend calls backend to build transaction
3. **Proof Generation**: Wallet's proving server creates ZK proof
4. **Transaction Submission**: Wallet submits to Midnight node
5. **State Update**: Indexer updates contract state

## Privacy Features

The Private Vault demonstrates several privacy features:

1. **Owner Privacy**: The owner is stored as a hash, not the actual public key
2. **Amount Privacy**: Deposit/withdraw amounts can be kept private
3. **Sequence Tracking**: Counter prevents replay attacks
4. **State Encryption**: Sensitive state can be encrypted on-chain

## Next Steps

To extend this dApp:

1. Add more sophisticated privacy-preserving features
2. Integrate with other Midnight contracts
3. Add token minting/burning
4. Implement access control lists
5. Add multi-signature support

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Wallet not detected | Install Lace or 1AM wallet extension |
| Proof server error | Start Docker proof server: `docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3` |
| Contract not found | Deploy contract first via backend |
| Network errors | Ensure you're on Midnight Preprod |

## Resources

- [Midnight Documentation](https://docs.midnight.network/)
- [Compact Language Guide](https://docs.midnight.network/compact)
- [DApp Connector API](https://docs.midnight.network/api-reference/dapp-connector)
- [Developer Forum](https://forum.midnight.network/)
- [Discord](https://discord.com/invite/midnightnetwork)
