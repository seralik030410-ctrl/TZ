import { getOfflineAccount, getTaskEpoch } from "@/lib/offline";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, splitLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../api/router";
import type { inferRouterOutputs } from "@trpc/server";
import type { ReactNode } from "react";

// Shared singleton exports are consumed by hooks across the app, so this provider module also exposes them.
// eslint-disable-next-line react-refresh/only-export-components
export const trpc = createTRPCReact<AppRouter>();
export type RouterOutputs = inferRouterOutputs<AppRouter>;

// eslint-disable-next-line react-refresh/only-export-components
export const queryClient = new QueryClient();
const trpcClient = trpc.createClient({
  links: [splitLink({
    condition: operation => operation.path.startsWith("planner.auth."),
    true: httpBatchLink({ url: "/api/trpc", transformer: superjson, fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: "include" }) }),
    false: httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers: () => { const account = getOfflineAccount(); return account ? { "X-Planner-Account": account, "X-Planner-Task-Epoch": String(getTaskEpoch()) } : {}; },
      fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: "include" }),
    }),
  })],
});

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
