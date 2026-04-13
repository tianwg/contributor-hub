import { createVaultPrivateState, witnesses, VaultPrivateState } from './witnesses';

describe('Vault Witnesses', () => {
  describe('createVaultPrivateState', () => {
    it('should create a valid private state', () => {
      const secretKey = new Uint8Array(32).fill(1);
      const privateState = createVaultPrivateState(secretKey);

      expect(privateState.secretKey).toBe(secretKey);
    });

    it('should handle empty secret key', () => {
      const secretKey = new Uint8Array(32);
      const privateState = createVaultPrivateState(secretKey);

      expect(privateState.secretKey).toHaveLength(32);
    });
  });

  describe('witnesses.localSecretKey', () => {
    it('should return the secret key from private state', () => {
      const secretKey = new Uint8Array(32).fill(42);
      const privateState: VaultPrivateState = { secretKey };

      const result = witnesses.localSecretKey({ privateState });

      expect(result).toBe(secretKey);
    });

    it('should return consistent results', () => {
      const secretKey = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
      const privateState: VaultPrivateState = { secretKey };

      const result1 = witnesses.localSecretKey({ privateState });
      const result2 = witnesses.localSecretKey({ privateState });

      expect(result1).toEqual(result2);
    });
  });
});