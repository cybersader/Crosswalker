module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ["**/tests/**/*.test.ts"],
  collectCoverage: false,
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleDirectories: ["node_modules", "src", "tests"],
  moduleFileExtensions: ['js', 'ts'],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^obsidian$": "<rootDir>/tests/__mocks__/obsidian.ts",
  },
  noStackTrace: true,
};
