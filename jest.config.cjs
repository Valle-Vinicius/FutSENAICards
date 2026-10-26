module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(png|jpg|jpeg|gif|svg|mp3)$': '<rootDir>/__mocks__/fileMock.cjs',
  },
  transformIgnorePatterns: ['/node_modules/(?!(nanoid|zustand)/)'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
};
