export default {
  testEnvironment: 'node',
  testMatch: ['**/contract.test.ts'],
  moduleFileExtensions: ['js', 'ts', 'jsx', 'tsx', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2020',
          module: 'ESNext',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: false,
          skipLibCheck: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!@midnight-ntwrk)',
  ],
  roots: ['<rootDir>/src'],
};