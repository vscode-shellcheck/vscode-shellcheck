// @ts-check

/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config}
 */
export default {
  overrides: [
    {
      files: "README.md",
      options: {
        trailingComma: "none",
      },
    },
  ],
};
