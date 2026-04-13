import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

__compactRuntime.checkRuntimeVersion('0.15.0');

export var VaultState;
(function (VaultState) {
  VaultState[(VaultState['UNINITIALIZED'] = 0)] = 'UNINITIALIZED';
  VaultState[(VaultState['ACTIVE'] = 1)] = 'ACTIVE';
  VaultState[(VaultState['LOCKED'] = 2)] = 'LOCKED';
})(VaultState || (VaultState = {}));

export var State;
(function (State) {
  State[(State['UNINITIALIZED'] = 0)] = 'UNINITIALIZED';
  State[(State['ACTIVE'] = 1)] = 'ACTIVE';
  State[(State['LOCKED'] = 2)] = 'LOCKED';
})(State || (State = {}));

export const pureCircuits = {
  publicKey: (sk, sequence) => {
    const { persistentHash } = __compactRuntime;
    const vec = __compactRuntime.vec32(32);
    vec[0] = __compactRuntime.pad32('vault:pk:');
    vec[1] = sequence;
    vec[2] = sk;
    return persistentHash(vec);
  }
};

export function ledger(state) {
  if (!state) {
    return {
      vaultState: VaultState.UNINITIALIZED,
      totalDeposits: 0n,
      owner: new Uint8Array(32),
      sequence: 1n
    };
  }
  
  const vaultStateValue = typeof state.vaultState === 'number' ? state.vaultState : 
    (state.vaultState?.is_some ? state.vaultState.value : VaultState.UNINITIALIZED);
  
  const totalDepositsValue = typeof state.totalDeposits === 'bigint' ? state.totalDeposits :
    (state.totalDeposits?.is_some ? state.totalDeposits.value : 0n);
  
  const ownerValue = state.owner ? new Uint8Array(state.owner) : new Uint8Array(32);
  const sequenceValue = typeof state.sequence === 'bigint' ? state.sequence :
    (state.sequence?.is_some ? state.sequence.value : 1n);

  return {
    vaultState: vaultStateValue,
    totalDeposits: totalDepositsValue,
    owner: ownerValue,
    sequence: sequenceValue
  };
}

export class Contract {
  witnesses;
  
  constructor(witnesses) {
    this.witnesses = witnesses;
  }

  initialState(context) {
    return {
      state: {
        vaultState: VaultState.UNINITIALIZED,
        totalDeposits: 0n,
        owner: new Uint8Array(32),
        sequence: 1n
      },
      privateState: context.privateState
    };
  }

  get circuits() {
    return {
      initializeVault: this.#initializeVault.bind(this),
      deposit: this.#deposit.bind(this),
      withdraw: this.#withdraw.bind(this),
      lockVault: this.#lockVault.bind(this),
      unlockVault: this.#unlockVault.bind(this),
      getOwner: this.#getOwner.bind(this)
    };
  }

  get impureCircuits() {
    return this.circuits;
  }

  #initializeVault(context) {
    const currentState = ledger(context.originalState);
    
    if (currentState.vaultState !== VaultState.UNINITIALIZED) {
      throw new __compactRuntime.CompactError('Vault already initialized');
    }

    const secretKey = this.witnesses.localSecretKey(context);
    const sequenceBytes = __compactRuntime.u64ToBytes(currentState.sequence);
    const pk = pureCircuits.publicKey(secretKey, sequenceBytes);

    const newState = {
      ...currentState,
      owner: pk,
      vaultState: VaultState.ACTIVE
    };

    return {
      state: newState,
      privateState: context.privateState
    };
  }

  #deposit(context, amount) {
    const currentState = ledger(context.originalState);
    
    if (currentState.vaultState !== VaultState.ACTIVE) {
      throw new __compactRuntime.CompactError('Vault is not active');
    }

    const newState = {
      ...currentState,
      totalDeposits: currentState.totalDeposits + amount,
      sequence: currentState.sequence + 1n
    };

    return {
      state: newState,
      privateState: context.privateState
    };
  }

  #withdraw(context, amount) {
    const currentState = ledger(context.originalState);
    
    if (currentState.vaultState !== VaultState.ACTIVE) {
      throw new __compactRuntime.CompactError('Vault is not active');
    }

    if (amount > currentState.totalDeposits) {
      throw new __compactRuntime.CompactError('Insufficient funds');
    }

    const secretKey = this.witnesses.localSecretKey(context);
    const sequenceBytes = __compactRuntime.u64ToBytes(currentState.sequence);
    const pk = pureCircuits.publicKey(secretKey, sequenceBytes);

    if (!__compactRuntime.bytesEqual(pk, currentState.owner)) {
      throw new __compactRuntime.CompactError('Not the owner');
    }

    const newState = {
      ...currentState,
      totalDeposits: currentState.totalDeposits - amount,
      sequence: currentState.sequence + 1n
    };

    return {
      state: newState,
      privateState: context.privateState
    };
  }

  #lockVault(context) {
    const currentState = ledger(context.originalState);
    
    if (currentState.vaultState !== VaultState.ACTIVE) {
      throw new __compactRuntime.CompactError('Vault is not active');
    }

    const secretKey = this.witnesses.localSecretKey(context);
    const sequenceBytes = __compactRuntime.u64ToBytes(currentState.sequence);
    const pk = pureCircuits.publicKey(secretKey, sequenceBytes);

    if (!__compactRuntime.bytesEqual(pk, currentState.owner)) {
      throw new __compactRuntime.CompactError('Not the owner');
    }

    const newState = {
      ...currentState,
      vaultState: VaultState.LOCKED
    };

    return {
      state: newState,
      privateState: context.privateState
    };
  }

  #unlockVault(context) {
    const currentState = ledger(context.originalState);
    
    if (currentState.vaultState !== VaultState.LOCKED) {
      throw new __compactRuntime.CompactError('Vault is not locked');
    }

    const secretKey = this.witnesses.localSecretKey(context);
    const sequenceBytes = __compactRuntime.u64ToBytes(currentState.sequence);
    const pk = pureCircuits.publicKey(secretKey, sequenceBytes);

    if (!__compactRuntime.bytesEqual(pk, currentState.owner)) {
      throw new __compactRuntime.CompactError('Not the owner');
    }

    const newState = {
      ...currentState,
      vaultState: VaultState.ACTIVE
    };

    return {
      state: newState,
      privateState: context.privateState
    };
  }

  #getOwner(context) {
    const currentState = ledger(context.originalState);
    return {
      result: currentState.owner,
      state: currentState,
      privateState: context.privateState
    };
  }
}
