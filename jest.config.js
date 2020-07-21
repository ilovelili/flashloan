module.exports = {
  clearMocks: true,
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.[tj]s?(x)"],
  modulePathIgnorePatterns: ["<rootDir>/node_modules/"],
  testPathIgnorePatterns: ["<rootDir>/node_modules/"],
};
