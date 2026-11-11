export const ORIGINAL_BACKEND = "https://ptueckxivgzrdwqjrlwk.supabase.co";
export function assertSeparateBackend(url: string | undefined) {
  if (url && new URL(url).hostname === new URL(ORIGINAL_BACKEND).hostname)
    throw new Error("WIFAURA cannot connect to the NIMAURA backend. Configure a separate project.");
}
