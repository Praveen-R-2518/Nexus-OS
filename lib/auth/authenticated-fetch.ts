/**
 * Browser fetch with same-origin cookies and short 401 retry window
 * (covers post-login race before SSR session cookies are readable).
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const merged: RequestInit = {
    ...init,
    credentials: init?.credentials ?? "same-origin",
  };
  const maxRetries = 4;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(input, merged);
    if (res.status !== 401 || attempt === maxRetries - 1) {
      return res;
    }
    await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
  }
  return fetch(input, merged);
}
