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
