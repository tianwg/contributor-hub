import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export declare enum VaultState {
  UNINITIALIZED = 0,
  ACTIVE = 1,
  LOCKED = 2
}

export type Maybe<T> = { is_some: boolean; value: T };

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): Uint8Array;
};

export type Circuits<PS> = {
  initializeVault(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  deposit(context: __compactRuntime.CircuitContext<PS>, amount: bigint): __compactRuntime.CircuitResults<PS, []>;
  withdraw(context: __compactRuntime.CircuitContext<PS>, amount: bigint): __compactRuntime.CircuitResults<PS, []>;
  lockVault(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  unlockVault(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  getOwner(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, Uint8Array>;
};

export type ImpureCircuits<PS> = Circuits<PS>;

export type PureCircuits = {
  publicKey(sk: Uint8Array, sequence: Uint8Array): Uint8Array;
};

export type Ledger = {
  readonly vaultState: VaultState;
  readonly totalDeposits: bigint;
  readonly owner: Uint8Array;
  readonly sequence: bigint;
};

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState | null): Ledger;

export declare const pureCircuits: PureCircuits;
