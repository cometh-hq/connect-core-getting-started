"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Inter } from "next/font/google";
import "./lib/ui/globals.css";

import { ConnectProvider } from "@cometh/connect-react-hooks";
import { http, WagmiProvider, createConfig } from "wagmi";
import * as chains from "viem/chains";
import { extractChain } from "viem";

const queryClient = new QueryClient();

const inter = Inter({
  subsets: ["latin"],
});

const apiKey = process.env.NEXT_PUBLIC_COMETH_API_KEY;
const bundlerUrl = process.env.NEXT_PUBLIC_4337_BUNDLER_URL;
const paymasterUrl = process.env.NEXT_PUBLIC_4337_PAYMASTER_URL;

const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!);

const chain = extractChain({
  chains: Object.values(chains),
  id: chainId,
});

if (!apiKey) throw new Error("API key not found");
if (!bundlerUrl) throw new Error("Bundler Url not found");

const config = createConfig({
  chains: [chain],
  transports: {
    [chain.id]: http(),
  },
  ssr: true,
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <ConnectProvider
            config={{
              paymasterUrl,
              bundlerUrl,
              apiKey,
              chain: chain,
            }}
            queryClient={queryClient}
          >
            <body className={inter.className}>{children}</body>
          </ConnectProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </html>
  );
}
