module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/setupTests.js'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
  transformIgnorePatterns: [
    '/node_modules/(?!(@fullcalendar|preact)/)',
  ],
  moduleNameMapper: {
    '^../api/apiConfig$': '<rootDir>/src/api/apiConfig.test.js',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
};
