import nextTypescript from "eslint-config-next/typescript";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
const eslintConfig = [...nextTypescript, ...nextCoreWebVitals, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"]
}, {
  rules: {
    "react/no-unescaped-entities": "off",
    "@typescript-eslint/no-empty-object-type": "off",
  },
}];

export default eslintConfig;
