export type VaultPrivateState = {
    secretKey: Uint8Array;
};
export declare const createVaultPrivateState: (secretKey: Uint8Array) => VaultPrivateState;
export declare const witnesses: {
    localSecretKey: (context: {
        privateState: VaultPrivateState;
    }) => Uint8Array;
};
//# sourceMappingURL=witnesses.d.ts.map