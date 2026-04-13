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
  
  if (!contractAddress) {
    return res.status(400).json({ error: 'Contract address required' });
  }
  
  const contract = deployedContracts.get(contractAddress);
  
  if (!contract) {
    return res.status(404).json({ error: 'Contract not found' });
  }
  
  contract.state.vaultState = 1;
  
  console.log(`[Backend] Vault initialized: ${contractAddress}`);
  
  res.json({ 
    success: true, 
    transaction: '0xinitialized',
    state: contract.state 
  });
});

app.post('/api/deposit', (req: Request, res: Response) => {
  const { contractAddress, amount } = req.body;
  
  if (!contractAddress) {
    return res.status(400).json({ error: 'Contract address required' });
  }
  
  const contract = deployedContracts.get(contractAddress);
  
  if (!contract) {
    return res.status(404).json({ error: 'Contract not found' });
  }
  
  if (contract.state.vaultState !== 1) {
    return res.status(400).json({ error: 'Vault is not active' });
  }
  
  contract.state.totalDeposits += BigInt(amount);
  contract.state.sequence += 1n;
  
  console.log(`[Backend] Deposited ${amount} to vault: ${contractAddress}`);
  
  res.json({ 
    success: true, 
    transaction: '0xdeposit',
    state: contract.state 
  });
});

app.post('/api/withdraw', (req: Request, res: Response) => {
  const { contractAddress, amount } = req.body;
  
  if (!contractAddress) {
    return res.status(400).json({ error: 'Contract address required' });
  }
  
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
  
  console.log(`[Backend] Withdrawn ${amount} from vault: ${contractAddress}`);
  
  res.json({ 
    success: true, 
    transaction: '0xwithdraw',
    state: contract.state 
  });
});

app.post('/api/lock', (req: Request, res: Response) => {
  const { contractAddress } = req.body;
  
  const contract = deployedContracts.get(contractAddress);
  
  if (!contract) {
    return res.status(404).json({ error: 'Contract not found' });
  }
  
  contract.state.vaultState = 2;
  
  res.json({ success: true, state: contract.state });
});

app.post('/api/unlock', (req: Request, res: Response) => {
  const { contractAddress } = req.body;
  
  const contract = deployedContracts.get(contractAddress);
  
  if (!contract) {
    return res.status(404).json({ error: 'Contract not found' });
  }
  
  contract.state.vaultState = 1;
  
  res.json({ success: true, state: contract.state });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', contracts: deployedContracts.size });
});

app.listen(PORT, () => {
  console.log(`[Backend] Server running on port ${PORT}`);
  console.log(`[Backend] Health check: http://localhost:${PORT}/api/health`);
});
