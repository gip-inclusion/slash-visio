export function formatMessage({ url, subject }: { url: string; subject?: string | null }): string {
  const trimmed = subject?.trim();
  if (!trimmed) return url;
  return `*${trimmed}*\n${url}`;
}
