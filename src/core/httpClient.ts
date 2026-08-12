export async function getJson<T>(
  url: string,
  headers: Record<string, string>
): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}
