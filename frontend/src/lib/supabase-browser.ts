import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // During static prerender the env may be absent; return a no-op stub so
    // the page can render. The real client is created in the browser.
    return {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: async () => ({ data: {}, error: new Error("Not configured") }),
        signUp: async () => ({ data: {}, error: new Error("Not configured") }),
        signOut: async () => ({}),
      },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        insert: async () => ({ error: null }),
      }),
    } as unknown as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(url, key);
}
