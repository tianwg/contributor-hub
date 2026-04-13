export const createVaultPrivateState = (secretKey) => ({
    secretKey,
});
export const witnesses = {
    localSecretKey: (context) => {
        return context.privateState.secretKey;
    },
};
//# sourceMappingURL=witnesses.js.map