export function getWikiUrlForRule(ruleId: number | string): string {
  if (typeof ruleId === "number" || !ruleId.startsWith("SC")) {
    ruleId = `SC${ruleId}`;
  }

  return `https://www.shellcheck.net/wiki/${ruleId}`;
}
