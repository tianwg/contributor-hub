import { useState } from 'react';

interface VaultState {
  vaultState: number;
  totalDeposits: bigint;
  owner: Uint8Array;
  sequence: bigint;
}

const VAULT_STATES = ['UNINITIALIZED', 'ACTIVE', 'LOCKED'];

declare const window: any;

function App() {
  const [wallet, setWallet] = useState<any>(null);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [contractAddress, setContractAddress] = useState<string>('');
  const [vaultState, setVaultState] = useState<VaultState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [amount, setAmount] = useState<string>('100');
  const [status, setStatus] = useState<string>('Connect your wallet to get started');

  const detectWallet = (): any => {
    const wallets = window.midnight;
    if (!wallets) return undefined;
    return Object.values(wallets)[0];
  };

  const connectWallet = async () => {
    try {
      setLoading(true);
      setError('');
      
      const selectedWallet = detectWallet();
      if (!selectedWallet) {
        throw new Error('No Midnight wallet found. Please install Lace or 1AM wallet.');
      }

      const connectedApi = await selectedWallet.connect('preprod');
      const addresses = await connectedApi.getShieldedAddresses();
      
      setWallet(connectedApi);
      setWalletAddress(addresses.shieldedAddress || 'Connected');
      setStatus('Wallet connected! You can now deploy or interact with the vault.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  const disconnectWallet = () => {
    setWallet(null);
    setWalletAddress('');
    setContractAddress('');
    setVaultState(null);
    setStatus('Connect your wallet to get started');
  };

  const deployContract = async () => {
    if (!wallet) return;
    
    try {
      setLoading(true);
      setError('');
      setStatus('Deploying contract...');

      const config = await wallet.getConfiguration();
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node: config.node,
          indexer: config.indexer,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to deploy contract');
      }

      const data = await response.json();
      setContractAddress(data.address);
      setStatus(`Contract deployed!`);
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
      setError('');

      const config = await wallet.getConfiguration();
      const response = await fetch(`/api/state?address=${contractAddress}&node=${config.node}&indexer=${config.indexer}`);
      
      if (!response.ok) {
        throw new Error('Failed to read state');
      }

      const data = await response.json();
      setVaultState(data);
      setStatus('State retrieved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read state');
    } finally {
      setLoading(false);
    }
  };

  const initializeVault = async () => {
    if (!wallet) return;
    
    try {
      setLoading(true);
      setError('');
      setStatus('Initializing vault...');
      
      const config = await wallet.getConfiguration();
      const response = await fetch('/api/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractAddress,
          node: config.node,
          indexer: config.indexer,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to initialize vault');
      }

      const data = await response.json();
      await wallet.submitTransaction(data.transaction || '0x0');
      setStatus('Vault initialized successfully!');
      await readState();
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
      setError('');
      setStatus('Depositing...');

      const config = await wallet.getConfiguration();
      const response = await fetch('/api/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractAddress,
          amount: Number(amount),
          node: config.node,
          indexer: config.indexer,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to deposit');
      }

      const data = await response.json();
      await wallet.submitTransaction(data.transaction || '0x0');
      setStatus(`Deposited ${amount}!`);
      await readState();
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
      setError('');
      setStatus('Withdrawing...');

      const config = await wallet.getConfiguration();
      const response = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractAddress,
          amount: Number(amount),
          node: config.node,
          indexer: config.indexer,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to withdraw');
      }

      const data = await response.json();
      await wallet.submitTransaction(data.transaction || '0x0');
      setStatus(`Withdrawn ${amount}!`);
      await readState();
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
        <p className="subtitle">A privacy-preserving vault dApp on Midnight</p>
      </header>

      <main>
        <section className="wallet-section">
          <h2>Wallet Connection</h2>
          {wallet ? (
            <div className="connected">
              <p>Connected: <code>{walletAddress}</code></p>
              <button onClick={disconnectWallet} className="btn-disconnect">
                Disconnect
              </button>
            </div>
          ) : (
            <button onClick={connectWallet} disabled={loading} className="btn-connect">
              {loading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </section>

        {wallet && (
          <>
            <section className="contract-section">
              <h2>Contract</h2>
              <div className="actions">
                <button onClick={deployContract} disabled={loading} className="btn-primary">
                  Deploy Vault
                </button>
                <button onClick={readState} disabled={loading || !contractAddress} className="btn-secondary">
                  Read State
                </button>
              </div>
              {contractAddress && (
                <p className="contract-address">
                  Address: <code>{contractAddress}</code>
                </p>
              )}
            </section>

            {contractAddress && (
              <section className="vault-section">
                <h2>Vault Operations</h2>
                
                {vaultState && (
                  <div className="vault-state">
                    <h3>Current State</h3>
                    <dl>
                      <dt>Status</dt>
                      <dd>{VAULT_STATES[vaultState.vaultState] || 'UNKNOWN'}</dd>
                      <dt>Total Deposits</dt>
                      <dd>{vaultState.totalDeposits.toString()} lovelace</dd>
                      <dt>Sequence</dt>
                      <dd>{vaultState.sequence.toString()}</dd>
                    </dl>
                  </div>
                )}

                <div className="operations">
                  <button onClick={initializeVault} disabled={loading} className="btn-primary">
                    Initialize Vault
                  </button>
                  
                  <div className="amount-input">
                    <label>
                      Amount:
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        min="1"
                      />
                    </label>
                  </div>
                  
                  <button onClick={deposit} disabled={loading} className="btn-primary">
                    Deposit
                  </button>
                  <button onClick={withdraw} disabled={loading} className="btn-danger">
                    Withdraw
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {error && (
          <div className="error">
            <strong>Error:</strong> {error}
          </div>
        )}

        <section className="status-section">
          <p>{status}</p>
        </section>
      </main>

      <footer>
        <p>Built with Midnight - The privacy-preserving blockchain</p>
      </footer>
    </div>
  );
}

export default App;
