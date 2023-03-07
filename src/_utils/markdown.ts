export function markdownCode(
  string: string | unknown,
  { inline }: { inline?: boolean } = {}
) {
  return inline ? `\`${string}\`` : `\`\`\`\n${string}\n\`\`\``;
}
