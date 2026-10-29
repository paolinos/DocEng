/** @type {import('jest').Config} */
export default {
  testMatch: ["**/src/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {},
    ],
  },
};
