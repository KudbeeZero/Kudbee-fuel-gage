module.exports = {
  preset: 'react-native',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|expo-constants|expo-application|expo-modules-core|expo-asset|expo-file-system)/)'
  ],
  testMatch: ['**/__tests__/**/*.(test|spec).(ts|tsx|js)'],
  setupFilesAfterEnv: [],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^expo-constants$': '<rootDir>/__mocks__/expo-constants.js',
    '^expo-application$': '<rootDir>/__mocks__/expo-application.js',
    '^expo-modules-core$': '<rootDir>/__mocks__/expo-modules-core.js',
    '^expo-asset$': '<rootDir>/__mocks__/expo-asset.js',
    '^expo-file-system$': '<rootDir>/__mocks__/expo-file-system.js',
    '^react-native$': '<rootDir>/__mocks__/react-native.js'
  }
};
