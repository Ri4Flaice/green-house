import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      ".next-dev.*.log",
      "next-env.d.ts",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**"
    ]
  }
];

export default eslintConfig;
