"use client";

import {
  ENTRYPOINT_ADDRESS_V07,
  createComethPaymasterClient,
  createSafeSmartAccount,
  createSmartAccountClient,
} from "@cometh/connect-sdk-4337";
import { useState } from "react";
import { http, type Hex } from "viem";
import * as chains from "viem/chains";
import { extractChain } from "viem";

export function useSmartAccount() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [newSigner, setNewSigner] = useState<any | null>(null);

  const [smartAccount, setSmartAccount] = useState<any | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_COMETH_API_KEY;
  const bundlerUrl = process.env.NEXT_PUBLIC_4337_BUNDLER_URL;
  const paymasterUrl = process.env.NEXT_PUBLIC_4337_PAYMASTER_URL;
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!);

  const chain = extractChain({
    chains: Object.values(chains),
    id: chainId,
  });

  function displayError(message: string) {
    setConnectionError(message);
  }

  async function connect() {
    if (!apiKey) throw new Error("API key not found");
    if (!bundlerUrl) throw new Error("Bundler Url not found");

    setIsConnecting(true);
    try {
      const localStorageAddress = window.localStorage.getItem(
        "walletAddress"
      ) as Hex;

      let smartAccount;

      if (localStorageAddress) {
        smartAccount = await createSafeSmartAccount({
          apiKey,
          chain: chain,
          smartAccountAddress: localStorageAddress,
          entryPoint: ENTRYPOINT_ADDRESS_V07,
        });
      } else {
        smartAccount = await createSafeSmartAccount({
          apiKey,
          chain: chain,
          entryPoint: ENTRYPOINT_ADDRESS_V07,
        });
        window.localStorage.setItem("walletAddress", smartAccount.address);
      }

      const paymasterClient = await createComethPaymasterClient({
        transport: http(paymasterUrl),
        chain: chain,
        entryPoint: ENTRYPOINT_ADDRESS_V07,
      });

      const smartAccountClient = createSmartAccountClient({
        account: smartAccount,
        entryPoint: ENTRYPOINT_ADDRESS_V07,
        chain: chain,
        bundlerTransport: http(bundlerUrl),
        middleware: {
          sponsorUserOperation: paymasterClient.sponsorUserOperation,
          gasPrice: paymasterClient.gasPrice,
        },
      });

      setSmartAccount(smartAccountClient);
      setIsConnected(true);
    } catch (e) {
      displayError((e as Error).message);
    } finally {
      setIsConnecting(false);
    }
  }

  return {
    smartAccount,
    connect,
    isConnected,
    isConnecting,
    connectionError,
    newSigner,
    setNewSigner,
    setConnectionError,
  };
}
