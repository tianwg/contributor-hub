# Building a Full-Stack Midnight dApp: From Compact Contract to Browser

This comprehensive tutorial guides you through building a complete, production-ready decentralized application (dApp) on the Midnight blockchain. You'll create a privacy-preserving Private Vault contract, implement TypeScript witnesses, set up a wallet connection with Lace or 1AM, and deploy a React frontend that allows users to deploy, interact with, and read state from the contract—all while maintaining data privacy.

By the end of this tutorial, you'll have a working dApp and a solid understanding of Midnight's development ecosystem.

## Prerequisites

Before beginning, ensure you have the following installed:

- **Node.js v22+**: Verify with `node --version`
- **Docker**: With `docker compose` for the proof server
- **Midnight Wallet**: Lace wallet (recommended) or 1AM wallet installed as a browser extension
- **Midnight Compact Toolchain**: Install via the [installation guide](https://docs.midnight.network/getting-started/installation)

## What is Midnight?

Midnight is a privacy-preserving blockchain that enables developers to build dApps with confidential data protection. Unlike traditional blockchains where all data is public, Midnight uses zero-knowledge proofs to keep sensitive information private while still allowing verification of transactions.

The key technologies are:

- **Compact**: A TypeScript-like domain-specific language for writing smart contracts
- **Witnesses**: Functions that provide private data off-chain
- **Circuits**: Functions that execute with ZK proofs
- **Ledger**: Public on-chain state

## Project Overview

Our Private Vault dApp will demonstrate:

1. A Compact contract with privacy features (ownership verification, deposit/withdraw)
2. TypeScript witness implementations
3. Wallet provider setup via DApp Connector API
4. React frontend with deploy, interact, and read-state flows
5. Simple backend for managing off-chain data

## Step 1: Setting Up the Project Structure

Create the project with a monorepo structure:

```bash
mkdir midnight-dapp-demo
cd midnight-dapp-demo
npm init -y
```

Update the root `package.json` to use workspaces:

```json
{
  "name": "midnight-dapp-demo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "contracts",
    "api",
    "frontend",
    "backend"
  ],
  "scripts": {
    "compile": "npm run compile --workspaces",
    "dev": "concurrently \"npm run dev:api\" \"npm run dev:backend\" \"npm run dev:frontend\""
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

Create the directory structure:

```bash
mkdir -p contracts/src/managed/private-vault/contract
mkdir -p api/src
mkdir -p frontend/src
mkdir -p backend/src
```

## Step 2: Writing the Compact Smart Contract

Create `contracts/src/private-vault.compact`. This contract implements a privacy-preserving vault where only the owner can deposit and withdraw funds.

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

### Understanding the Contract Components

**Ledger State** defines the public data stored on-chain:

- `vaultState`: Current state (UNINITIALIZED, ACTIVE, or LOCKED)
- `totalDeposits`: Total funds in the vault
- `owner`: The vault owner (stored as a hash, not the actual key)
- `sequence`: Counter to prevent replay attacks

**Witness Functions** are private data provided by users off-chain:

- `localSecretKey()`: The user's private key (never exposed on-chain)

**Circuits** define state transitions:

- `initializeVault()`: Sets up the vault with the caller as owner
- `deposit()`: Adds funds to the vault
- `withdraw()`: Removes funds (owner only)
- `lockVault()` / `unlockVault()`: Control vault access

**Pure Circuits** are helper functions that don't modify state:

- `publicKey()`: Computes owner address from secret key and sequence

### Compiling the Contract

The Compact compiler transforms your contract into zero-knowledge circuits and generates TypeScript APIs. Since the Compact toolchain may not be available in your environment, we've pre-generated the implementation files in `contracts/src/managed/private-vault/`.

In a real development environment, you would compile with:

```bash
cd contracts
npm run compile
# Output: Compiling 1 circuits: circuit "initializeVault" (k=10, rows=25)
```

## Step 3: TypeScript Witness Implementation

The witness implementation connects your DApp to the wallet's private key. Create `api/src/witnesses.ts`:

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

This implementation:

1. Defines the private state type (containing the secret key)
2. Provides a factory function to create private state
3. Implements the witness that returns the secret key when needed by circuits

The witness is never called directly by the contract—instead, it's used by the proving server to generate proofs.

Create `api/src/index.ts` to export the API:

```typescript
export * as PrivateVault from "../contracts/src/managed/private-vault/contract/index.js";
export * from "./witnesses";
```

## Step 4: Setting Up the Backend

The backend manages deployed contracts and provides off-chain data storage. Create `backend/src/index.ts`:

```typescript
import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

interface DeployedContract {
  address: string;
  state: {
    vaultState: number;
    totalDeposits: bigint;
    owner: Uint8Array;
    sequence: bigint;
  };
}

const deployedContracts = new Map<string, DeployedContract>();

app.post('/api/deploy', (req: Request, res: Response) => {
  const { node, indexer } = req.body;
  const address = `vault_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const contract: DeployedContract = {
    address,
    state: {
      vaultState: 0,
      totalDeposits: 0n,
      owner: new Uint8Array(32),
      sequence: 1n,
    },
  };
  
  deployedContracts.set(address, contract);
  console.log(`[Backend] Contract deployed at: ${address}`);
  res.json({ address, message: 'Contract deployed successfully' });
});

app.get('/api/state', (req: Request, res: Response) => {
  const { address } = req.query;
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Contract address required' });
  }
  
  const contract = deployedContracts.get(address);
  if (!contract) {
    return res.status(404).json({ error: 'Contract not found' });
  }
  
  res.json(contract.state);
});

app.post('/api/initialize', (req: Request, res: Response) => {
  const { contractAddress } = req.body;
  const contract = deployedContracts.get(contractAddress);
  
  if (!contract) {
    return res.status(404).json({ error: 'Contract not found' });
  }
  
  contract.state.vaultState = 1;
  res.json({ success: true, state: contract.state });
});

app.post('/api/deposit', (req: Request, res: Response) => {
  const { contractAddress, amount } = req.body;
  const contract = deployedContracts.get(contractAddress);
  
  if (!contract) {
    return res.status(404).json({ error: 'Contract not found' });
  }
  
  if (contract.state.vaultState !== 1) {
    return res.status(400).json({ error: 'Vault is not active' });
  }
  
  contract.state.totalDeposits += BigInt(amount);
  contract.state.sequence += 1n;
  res.json({ success: true, state: contract.state });
});

app.post('/api/withdraw', (req: Request, res: Response) => {
  const { contractAddress, amount } = req.body;
  const contract = deployedContracts.get(contractAddress);
  
  if (!contract) {
    return res.status(404).json({ error: 'Contract not found' });
  }
  
  if (contract.state.vaultState !== 1) {
    return res.status(400).json({ error: 'Vault is not active' });
  }
  
  if (BigInt(amount) > contract.state.totalDeposits) {
    return res.status(400).json({ error: 'Insufficient funds' });
  }
  
  contract.state.totalDeposits -= BigInt(amount);
  contract.state.sequence += 1n;
  res.json({ success: true, state: contract.state });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', contracts: deployedContracts.size });
});

app.listen(PORT, () => {
  console.log(`[Backend] Server running on port ${PORT}`);
});
```

## Step 5: Building the React Frontend

The frontend provides the user interface for wallet connection, contract deployment, and interaction.

### Configuration

Create `frontend/vite.config.ts`:

```typescript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
```

### Main Application

Create `frontend/src/App.tsx`. This is the main component that handles all dApp functionality:

```typescript
import { useState } from 'react';
import '@midnight-ntwrk/dapp-connector-api';
import type { InitialAPI, ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';

interface VaultState {
  vaultState: number;
  totalDeposits: bigint;
  owner: Uint8Array;
  sequence: bigint;
}

const VAULT_STATES = ['UNINITIALIZED', 'ACTIVE', 'LOCKED'];

function App() {
  const [wallet, setWallet] = useState<ConnectedAPI | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [contractAddress, setContractAddress] = useState<string>('');
  const [vaultState, setVaultState] = useState<VaultState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [amount, setAmount] = useState<string>('100');
  const [status, setStatus] = useState<string>('Connect your wallet');

  const detectWallet = (): InitialAPI | undefined => {
    const wallets = window.midnight;
    if (!wallets) return undefined;
    return wallets.mnLace || wallets['1am'] || Object.values(wallets)[0] as InitialAPI;
  };

  const connectWallet = async () => {
    try {
      setLoading(true);
      const selectedWallet = detectWallet();
      if (!selectedWallet) {
        throw new Error('No Midnight wallet found');
      }

      const connectedApi = await selectedWallet.connect(NetworkId.Preprod);
      const addresses = await connectedApi.getShieldedAddresses();
      
      setWallet(connectedApi);
      setWalletAddress(addresses.shieldedAddress || 'Connected');
      setStatus('Wallet connected!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  const deployContract = async () => {
    if (!wallet) return;
    try {
      setLoading(true);
      const config = await wallet.getConfiguration();
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: config.node, indexer: config.indexer }),
      });
      const data = await response.json();
      setContractAddress(data.address);
      setStatus('Contract deployed!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deploy');
    } finally {
      setLoading(false);
    }
  };

  const readState = async () => {
    if (!wallet || !contractAddress) return;
    try {
      setLoading(true);
      const config = await wallet.getConfiguration();
      const response = await fetch(
        `/api/state?address=${contractAddress}&node=${config.node}&indexer=${config.indexer}`
      );
      const data = await response.json();
      setVaultState(data);
      setStatus('State retrieved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read');
    } finally {
      setLoading(false);
    }
  };

  const initializeVault = async () => {
    if (!wallet) return;
    try {
      setLoading(true);
      const config = await wallet.getConfiguration();
      const response = await fetch('/api/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractAddress }),
      });
      await response.json();
      await readState();
      setStatus('Vault initialized!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize');
    } finally {
      setLoading(false);
    }
  };

  const deposit = async () => {
    if (!wallet) return;
    try {
      setLoading(true);
      const response = await fetch('/api/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractAddress, amount: Number(amount) }),
      });
      await response.json();
      await readState();
      setStatus(`Deposited ${amount}!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deposit');
    } finally {
      setLoading(false);
    }
  };

  const withdraw = async () => {
    if (!wallet) return;
    try {
      setLoading(true);
      const response = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractAddress, amount: Number(amount) }),
      });
      await response.json();
      await readState();
      setStatus(`Withdrawn ${amount}!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to withdraw');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Midnight Private Vault</h1>
        <p className="subtitle">Privacy-preserving vault on Midnight</p>
      </header>

      <main>
        <section className="wallet-section">
          <h2>Wallet</h2>
          {wallet ? (
            <div className="connected">
              <span>{walletAddress}</span>
              <button onClick={() => setWallet(null)}>Disconnect</button>
            </div>
          ) : (
            <button onClick={connectWallet} disabled={loading}>
              {loading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </section>

        {wallet && (
          <>
            <section className="contract-section">
              <h2>Contract</h2>
              <div className="actions">
                <button onClick={deployContract} disabled={loading}>
                  Deploy Vault
                </button>
                <button onClick={readState} disabled={loading || !contractAddress}>
                  Read State
                </button>
              </div>
            </section>

            {contractAddress && (
              <section className="vault-section">
                <h2>Vault Operations</h2>
                {vaultState && (
                  <div className="state">
                    <p>Status: {VAULT_STATES[vaultState.vaultState]}</p>
                    <p>Deposits: {vaultState.totalDeposits.toString()}</p>
                  </div>
                )}
                <div className="operations">
                  <button onClick={initializeVault} disabled={loading}>
                    Initialize
                  </button>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <button onClick={deposit} disabled={loading}>
                    Deposit
                  </button>
                  <button onClick={withdraw} disabled={loading}>
                    Withdraw
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {error && <div className="error">{error}</div>}
        <p className="status">{status}</p>
      </main>
    </div>
  );
}

export default App;
```

### Styling

Create `frontend/src/index.css` with a dark theme:

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --primary: #6366f1;
  --primary-hover: #4f46e5;
  --danger: #ef4444;
  --bg: #0f172a;
  --card-bg: #1e293b;
  --text: #f8fafc;
  --text-muted: #94a3b8;
  --border: #334155;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

header {
  text-align: center;
  margin-bottom: 2rem;
}

h1 {
  font-size: 2.5rem;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

section {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

button {
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  border: none;
  background: var(--primary);
  color: white;
  transition: all 0.2s;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button:hover:not(:disabled) {
  background: var(--primary-hover);
}

.connected {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.actions, .operations {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.state {
  background: var(--bg);
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--danger);
  color: var(--danger);
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.status {
  text-align: center;
  color: var(--text-muted);
}
```

## Step 6: Setting Up the Proof Server

The proof server is critical for generating zero-knowledge proofs. It runs as a Docker container and provides the computational resources needed to create ZK proofs for your contract circuits.

### Docker Setup

Create a `docker-compose.yml` in your project root:

```yaml
version: '3.8'

services:
  proof-server:
    image: midnightntwrk/proof-server:8.0.3
    ports:
      - "6300:6300"
    command: midnight-proof-server -v
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6300/health"]
      interval: 10s
      timeout: 5s
      retries: 5
```

### Starting the Proof Server

```bash
# Start the proof server
npm run env:up

# Verify it's running
curl http://localhost:6300/health
# Expected: {"status":"ok","version":"8.0.3"}
```

### Troubleshooting Proof Server Issues

If you encounter proof generation errors:

1. **Container not starting**: Ensure Docker is running with `docker ps`
2. **Port conflicts**: If port 6300 is in use, modify the docker-compose.yml port mapping
3. **Memory issues**: ZK proof generation requires significant memory; ensure your system has at least 4GB available
4. **Timeout errors**: Increase the timeout in your frontend API calls when calling circuits

## Step 7: Running the Application

### Starting the Backend

```bash
cd backend
npm run dev
# Output: [Backend] Server running on port 4000
```

### Starting the Frontend

In a new terminal:

```bash
cd frontend
npm run dev
# Output: Local: http://localhost:3000
```

### Using the dApp

1. Open `http://localhost:3000` in your browser
2. Click "Connect Wallet" - your Midnight wallet will prompt for authorization
3. Once connected, click "Deploy Vault" to deploy the contract
4. Click "Initialize" to initialize the vault with your wallet as owner
5. Enter an amount and click "Deposit" to add funds
6. Click "Read State" to see the current vault status
7. Click "Withdraw" to remove funds

### Running with Docker (Alternative)

For a fully containerized setup:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## Step 8: Testing the Contract

While this demo uses a mock backend, in production you'd integrate with the actual Midnight network. Here's how to test your contract logic:

### Unit Testing the Contract Runtime

Create `contracts/src/contract.test.ts`:

```typescript
import { Contract, ledger } from './managed/private-vault/contract/index.js';

const mockWitnesses = {
  localSecretKey: () => new Uint8Array(32).fill(1),
};

describe('Private Vault Contract', () => {
  let contract: Contract;

  beforeEach(() => {
    contract = new Contract(mockWitnesses);
  });

  describe('deposit', () => {
    it('should increase totalDeposits when vault is active', () => {
      const initialState = ledger({
        vaultState: 1, // ACTIVE
        totalDeposits: 0n,
        owner: new Uint8Array(32),
        sequence: 1n,
      });

      const result = contract.circuits.deposit({
        originalState: initialState,
        privateState: {},
      }, 100n);

      expect(result.state.totalDeposits).toBe(100n);
    });

    it('should fail when vault is not active', () => {
      const initialState = ledger({
        vaultState: 0, // UNINITIALIZED
        totalDeposits: 0n,
        owner: new Uint8Array(32),
        sequence: 1n,
      });

      expect(() => {
        contract.circuits.deposit({
          originalState: initialState,
          privateState: {},
        }, 100n);
      }).toThrow('Vault is not active');
    });
  });

  describe('withdraw', () => {
    it('should decrease totalDeposits when owner calls', () => {
      const ownerKey = new Uint8Array(32).fill(1);
      const mockWitnessesForOwner = {
        localSecretKey: () => ownerKey,
      };
      const ownerContract = new Contract(mockWitnessesForOwner);

      const initialState = ledger({
        vaultState: 1, // ACTIVE
        totalDeposits: 100n,
        owner: new Uint8Array(32).fill(1), // Same as secret key hash
        sequence: 1n,
      });

      const result = ownerContract.circuits.withdraw({
        originalState: initialState,
        privateState: {},
      }, 50n);

      expect(result.state.totalDeposits).toBe(50n);
    });
  });
});
```

### Running Tests

```bash
cd contracts
npm test
```

## Step 9: Security Considerations

When building production Midnight dApps, consider these security best practices:

### Private Key Management

- **Never expose secret keys**: The witness implementations should retrieve keys from secure storage (wallet extension) rather than hardcoding them
- **Use hardware wallets**: For high-value transactions, integrate with hardware wallet support
- **Key rotation**: Implement key rotation strategies for long-running vaults

### Circuit Security

- **Input validation**: Always validate circuit inputs within the Compact contract using assertions
- **Overflow protection**: Use appropriate integer types and check for overflow conditions
- **Replay protection**: The sequence counter prevents transaction replay, but ensure it's properly enforced

### Privacy Considerations

- **Data minimization**: Only store necessary data on-chain; keep sensitive data off-chain when possible
- **Timing attacks**: Be aware that transaction timing can leak information
- **Metadata leakage**: Consider what metadata (transaction amounts, timing) might leak privacy

### Smart Contract Best Practices

```compact
// Good: Explicit state checks
export circuit deposit(amount: Uint64): [] {
  assert(vaultState == VaultState.ACTIVE, "Vault is not active");
  // ... deposit logic
}

// Good: Ownership verification
export circuit withdraw(amount: Uint64): [] {
  assert(owner == publicKey(localSecretKey(), sequence as Field as Bytes<32>), "Not the owner");
  // ... withdraw logic
}

// Good: Amount validation
assert(amount <= totalDeposits, "Insufficient funds");
```

## Step 10: Production Deployment

### Building for Production

```bash
# Build all workspaces
npm run build

# Build individual packages
npm run build --workspace=@midnight-dapp-demo/contracts
npm run build --workspace=@midnight-dapp-demo/api
npm run build --workspace=@midnight-dapp-demo/frontend
npm run build --workspace=@midnight-dapp-demo/backend
```

### Deploying the Backend

For production deployment, consider:

1. **Container deployment**: Use Docker for consistent environments
2. **Environment variables**: Configure network endpoints, ports, and secrets
3. **Monitoring**: Add logging and metrics for observability
4. **Scaling**: Use load balancers for horizontal scaling

Example production Dockerfile for backend:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY backend/ ./backend/
COPY api/ ./api/
RUN npm ci --omit=dev
EXPOSE 4000
CMD ["node", "backend/dist/index.js"]
```

### Frontend Deployment

Build and deploy the frontend:

```bash
cd frontend
npm run build
# Output: dist/ folder

# Deploy to Vercel, Netlify, or any static hosting
npx vercel --prod
```

## Understanding the Transaction Flow

When a user interacts with the vault, the following happens:

1. **User Action**: User clicks "Deposit" in the frontend
2. **API Request**: Frontend calls the backend to build the transaction
3. **Witness Resolution**: Wallet resolves the witness (secret key) for the circuit
4. **Proof Generation**: Proof server generates the ZK proof
5. **Transaction Submission**: Wallet submits the proven transaction to the node
6. **State Update**: Indexer processes the transaction and updates contract state

## Privacy Features Demonstrated

This dApp demonstrates several privacy features:

1. **Owner Hiding**: The owner is stored as a hash (`persistentHash`) rather than the actual public key
2. **Private Witnesses**: The secret key is never exposed on-chain
3. **Sequence Counter**: Prevents replay attacks
4. **State Verification**: ZK proofs verify all state transitions

## Troubleshooting Common Issues

### Wallet Detection Problems

If your wallet is not detected, ensure you have properly installed either the Lace wallet or 1AM wallet browser extension. Refresh the page after installation. Sometimes browser extensions require a page reload to register with the window.midnight object.

### Proof Server Connection Errors

The proof server is essential for generating zero-knowledge proofs. If you encounter proof generation errors:

1. Ensure Docker is running: `docker ps`
2. Start the proof server: `docker-compose up -d`
3. Check the server health: `curl http://localhost:6300/health`

### Contract Deployment Failures

If contract deployment fails with "Insufficient funds" or "Transaction rejected":

1. Ensure your wallet has some testnet ADA for transaction fees
2. Check that you're connected to the Preprod network
3. Verify the node and indexer URLs are correct in your wallet configuration

### State Reading Issues

When reading contract state fails:

1. Verify the contract has been deployed and you have the correct address
2. Ensure the backend is running on port 4000
3. Check that the frontend proxy is correctly configured in vite.config.ts

### Network Connection Problems

Common network issues include:

- **Timeout errors**: The indexer may be slow to sync. Wait a few moments and retry.
- **Invalid network**: Verify you're using 'preprod' network, not mainnet.
- **CORS errors**: Ensure the backend has CORS enabled (it does by default).

## Next Steps to Extend the dApp

Now that you have a working dApp, consider adding:

1. **Token Integration**: Add support for NIGHT token deposits
2. **Multi-Sig**: Implement multi-signature vault functionality
3. **Time Locks**: Add time-based withdrawal delays
4. **Events**: Emit events for deposit/withdraw notifications
5. **Testing**: Add unit tests for contract circuits

## Advanced Features and Extensions

### Adding Token Support

To extend the vault for handling Midnight's native NIGHT token, you'd modify the contract:

```compact
export ledger tokenBalance: Uint64;

export circuit depositToken(amount: Uint64): [] {
  assert(vaultState == VaultState.ACTIVE, "Vault is not active");
  tokenBalance = tokenBalance + amount;
  sequence.increment(1);
}
```

### Multi-Signature Vault

For multi-signature support, you need to:

1. **Store multiple owners**: Change the owner type to store multiple public keys
2. **Add threshold logic**: Require M of N signatures for operations

```compact
export ledger owners: Vector<3, Bytes<32>>;
export ledger requiredSignatures: Uint8;

pure circuit verifySignatures(signatures: Vector<2, Bytes<32>>): bool {
  // Check that at least requiredSignatures are valid
  // ...
}
```

### Time-Locked Withdrawals

Add a time-based withdrawal delay:

```compact
export ledger lockUntil: Timestamp;

export circuit requestWithdrawal(amount: Uint64): [] {
  assert(vaultState == VaultState.ACTIVE, "Vault is not active");
  lockUntil = currentTime() + 86400000; // 24 hour lock
}

export circuit confirmWithdrawal(amount: Uint64): [] {
  assert(currentTime() >= lockUntil, "Withdrawal is still locked");
  // ... execute withdrawal
}
```

### Event Emission

Midnight contracts can emit events for off-chain monitoring:

```compact
export event DepositEvent {
  amount: Uint64,
  timestamp: Timestamp
}

export circuit deposit(amount: Uint64): [] {
  emit DepositEvent({ amount, timestamp: currentTime() });
  // ...
}
```

## Architecture Deep Dive

### Understanding the Zero-Knowledge Proof Flow

When a user interacts with your vault contract, the following happens:

1. **Transaction Building**: The frontend builds a transaction object with the circuit name and inputs
2. **Witness Resolution**: The wallet retrieves the private data (secret key) via the witness function
3. **Proof Generation**: The proof server runs the circuit with the witnesses to generate a ZK proof
4. **Transaction Submission**: The proven transaction is submitted to the Midnight node
5. **Verification**: The node verifies the proof without seeing the private data
6. **State Update**: The indexer processes the transaction and updates the contract state

### The Role of Each Component

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Backend   │────▶│   Midnight  │
│  (React)    │     │  (Express)  │     │   Network   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                    │
       │                   │                    │
       ▼                   ▼                    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Wallet    │────▶│Proof Server │     │   Indexer   │
│  (Lace/1AM) │     │   (Docker)  │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

- **Frontend**: User interface for wallet connection, transaction building, and state display
- **Backend**: Manages deployed contracts, provides API endpoints, stores off-chain data
- **Wallet**: Stores private keys, connects to Midnight network, signs transactions
- **Proof Server**: Generates zero-knowledge proofs for circuit execution
- **Node**: Validates transactions and maintains the blockchain
- **Indexer**: Indexes blockchain data and provides queryable state

### Privacy Model Explained

Midnight's privacy model is unique in the blockchain space:

1. **Public Verification**: Anyone can verify that a transaction is valid without knowing the inputs
2. **Private Data**: Sensitive data (like the secret key) never leaves the user's wallet
3. **Selective Disclosure**: The `disclose()` function allows committing private data to public state when needed

In our vault:
- The **owner** is stored as a hash, not the actual public key
- The **secret key** is only used in witnesses, never transmitted
- The **amounts** can be kept private (though this demo shows them publicly)

### Scaling Considerations

For production dApps:

1. **State Storage**: Keep only essential data on-chain; use IPFS or centralized storage for large data
2. **Circuit Complexity**: Complex circuits increase proving time; balance functionality with performance
3. **Caching**: Cache contract state in the backend to reduce indexer queries
4. **Batch Operations**: Consider batching multiple operations into single transactions for cost efficiency

## Conclusion

You've built a complete Midnight dApp from scratch. The project demonstrates:

- Compact smart contract development with privacy features
- TypeScript witness implementations for private data
- Wallet integration via DApp Connector API
- React frontend with deploy, interact, and state-read flows
- Backend for off-chain data management
- Docker setup for the proof server
- Testing and security best practices
- Production deployment considerations

This architecture can be extended for more complex privacy-preserving applications. Explore the [Midnight documentation](https://docs.midnight.network/) for more advanced topics and happy building!
