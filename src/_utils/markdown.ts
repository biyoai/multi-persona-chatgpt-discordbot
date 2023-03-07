export function markdownCode(
  string: string | unknown,
  {
    inline,
  }: {
    /** インラインコードならtrue */
    inline?: boolean;
  } = {}
) {
  return inline ? `\`${string}\`` : `\`\`\`\n${string}\n\`\`\``;
}
