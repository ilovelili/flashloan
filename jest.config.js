module.exports = {
  clearMocks: true,
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.[tj]s?(x)"],
  modulePathIgnorePatterns: ["<rootDir>/node_modules/"],
  testPathIgnorePatterns: ["<rootDir>/node_modules/"],
  transformIgnorePatterns: ["<rootDir>/node_modules/"],
};
