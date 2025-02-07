"use client"

import React, { useState, useEffect } from "react"
import {
    createSafeSmartAccount,
    createSmartAccountClient,
    createComethPaymasterClient,
    createNewSignerWithAccountAddress, type ComethSafeSmartAccount, type ComethSmartAccountClient,
} from "@cometh/connect-sdk-4337"
import { createPublicClient, http } from "viem"
import { arbitrumSepolia } from "viem/chains"
import axios from "axios"

const RECOVERY_DELAY = 3600
const LOCAL_STORAGE_KEY = 'recoveryDemo'

interface RecoveryState {
    smartAccount: ComethSafeSmartAccount | null
    smartAccountClient: ComethSmartAccountClient | null
    status: 'initial' | 'initialized' | 'setupComplete' | 'recoveryStarted' | 'recoveryComplete'
    message: string
    remainingTime: number | null
}

interface SavedState {
    smartAccount: ComethSafeSmartAccount | null
    status: RecoveryState['status']
}

export default function RecoveryPage() {
    const [state, setState] = useState<RecoveryState>({
        smartAccount: null,
        smartAccountClient: null,
        status: 'initial',
        message: '',
        remainingTime: null,
    })

    useEffect(() => {
        const savedState = localStorage.getItem(LOCAL_STORAGE_KEY)
        if (savedState) {
            try {
                const parsed = JSON.parse(savedState) as SavedState
                setState(prev => ({
                    ...prev,
                    smartAccount: parsed.smartAccount,
                    status: parsed.status,
                }))
            } catch (error) {
                console.error('Error parsing saved state:', error)
                localStorage.removeItem(LOCAL_STORAGE_KEY)
            }
        }
    }, [])

    useEffect(() => {
        let timer: NodeJS.Timeout | undefined
        if (state.status === 'recoveryStarted' && state.remainingTime !== null) {
            timer = setInterval(() => {
                setState(prev => ({
                    ...prev,
                    remainingTime: prev.remainingTime !== null ? Math.max(0, prev.remainingTime - 1) : null
                }))
            }, 1000)
        }
        return () => {
            if (timer) clearInterval(timer)
        }
    }, [state.status, state.remainingTime])

    const saveState = (newState: Partial<RecoveryState>) => {
        const savedState: SavedState = {
            smartAccount: newState.smartAccount ?? state.smartAccount,
            status: newState.status ?? state.status,
        }
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedState))
    }

    const initSmartAccount = async () => {
        try {
            setState(prev => ({ ...prev, message: "Initializing Smart Account..." }))

            const apiKey = process.env.NEXT_PUBLIC_COMETH_API_KEY
            const bundlerUrl = process.env.NEXT_PUBLIC_4337_BUNDLER_URL
            const paymasterUrl = process.env.NEXT_PUBLIC_4337_PAYMASTER_URL
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

            if (!apiKey || !bundlerUrl || !paymasterUrl || !baseUrl) {
                throw new Error("Missing environment variables")
            }

            const chain = arbitrumSepolia
            const publicClient = createPublicClient({
                chain,
                transport: http(),
                cacheTime: 60_000,
                batch: { multicall: { wait: 50 } },
            })

            const safeSmartAccount = await createSafeSmartAccount({
                apiKey,
                publicClient,
                chain,
                baseUrl,
            })

            const paymasterClient = createComethPaymasterClient({
                transport: http(paymasterUrl),
                chain,
                publicClient,
            })

            const smartAccClient = createSmartAccountClient({
                account: safeSmartAccount,
                chain,
                paymaster: paymasterClient,
                bundlerTransport: http(bundlerUrl),
                userOperation: {
                    estimateFeesPerGas: async () => {
                        return await paymasterClient.getUserOperationGasPrice()
                    },
                },
                publicClient,
            })

            const newState = {
                smartAccount: safeSmartAccount,
                smartAccountClient: smartAccClient,
                status: 'initialized' as const,
                message: `Smart Account initialized: ${safeSmartAccount.address}`,
            }

            setState(prev => ({ ...prev, ...newState }))
            saveState(newState)
        } catch (e) {
            console.error("Failed to initialize Smart Account", e)
            setState(prev => ({
                ...prev,
                message: "Error initializing Smart Account",
                status: 'initial'
            }))
        }
    }

    const setupRecovery = async () => {
        try {
            if (!state.smartAccountClient) {
                setState(prev => ({ ...prev, message: "Smart account client not initialized!" }))
                return
            }

            setState(prev => ({ ...prev, message: "Setting up recovery module..." }))
            await state.smartAccountClient.setUpRecoveryModule({})

            const newState = {
                status: 'setupComplete' as const,
                message: "Recovery module set up successfully!"
            }

            setState(prev => ({ ...prev, ...newState }))
            saveState(newState)
        } catch (error) {
            console.error("Error setting up recovery module:", error)
            setState(prev => ({ ...prev, message: "Failed to set up recovery module." }))
        }
    }

    const startRecovery = async () => {
        try {
            if (!state.smartAccount) {
                setState(prev => ({ ...prev, message: "Smart account not initialized!" }))
                return
            }

            setState(prev => ({ ...prev, message: "Starting recovery..." }))

            const signer = await createNewSignerWithAccountAddress({
                apiKey: process.env.NEXT_PUBLIC_COMETH_API_KEY!,
                smartAccountAddress: state.smartAccount.address,
                baseUrl: process.env.NEXT_PUBLIC_BASE_URL!,
            })

            const api = axios.create({
                baseURL: process.env.NEXT_PUBLIC_BASE_URL,
            })
            api.defaults.headers.common["apisecret"] = process.env.NEXT_PUBLIC_COMETH_API_SECRET

            await api.post("recovery/start-with-shared", {
                chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
                walletAddress: state.smartAccount.address,
                publicKeyId: signer.publicKeyId,
                publicKeyX: signer.publicKeyX,
                publicKeyY: signer.publicKeyY,
                deviceData: signer.deviceData,
            })

            const newState = {
                status: 'recoveryStarted' as const,
                remainingTime: RECOVERY_DELAY,
                message: "Recovery process started. Please wait 1 hour before finalizing."
            }

            setState(prev => ({ ...prev, ...newState }))
            saveState(newState)
        } catch (error) {
            console.error(error)
            if (axios.isAxiosError(error)) {
                setState(prev => ({
                    ...prev,
                    message: error.response?.data?.message || "An unexpected error occurred."
                }))
            } else {
                setState(prev => ({
                    ...prev,
                    message: "An unexpected error occurred."
                }))
            }
        }
    }

    const finalizeRecovery = async () => {
        try {
            if (!state.smartAccount) {
                setState(prev => ({ ...prev, message: "Smart account not initialized!" }))
                return
            }

            const api = axios.create({
                baseURL: process.env.NEXT_PUBLIC_BASE_URL,
            })
            api.defaults.headers.common["apisecret"] = process.env.NEXT_PUBLIC_COMETH_API_SECRET

            await api.post(`recovery/finalize`, {
                chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
                walletAddress: state.smartAccount.address,
            })

            const newState = {
                status: 'recoveryComplete' as const,
                remainingTime: null,
                message: "Recovery successfully finalized!"
            }

            setState(prev => ({ ...prev, ...newState }))
            saveState(newState)
        } catch (error) {
            console.error("Error finalizing recovery module:", error)
            setState(prev => ({ ...prev, message: "Failed to finalize recovery module." }))
        }
    }

    const formatTime = (seconds: number | null): string => {
        if (seconds === null) return ''
        const minutes = Math.floor(seconds / 60)
        const remainingSeconds = seconds % 60
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
    }

    const renderActionButton = () => {
        switch (state.status) {
            case 'initial':
                return (
                    <button
                        onClick={initSmartAccount}
                        className="bg-gray-800 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        Initialize Smart Account
                    </button>
                )
            case 'initialized':
                return (
                    <button
                        onClick={setupRecovery}
                        className="bg-gray-800 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        Setup Recovery
                    </button>
                )
            case 'setupComplete':
                return (
                    <button
                        onClick={startRecovery}
                        className="bg-gray-800 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        Start Recovery
                    </button>
                )
            case 'recoveryStarted':
                return (
                    <button
                        onClick={finalizeRecovery}
                        disabled={state.remainingTime !== null && state.remainingTime > 0}
                        className={`px-6 py-3 rounded-lg transition-colors ${
                            state.remainingTime !== null && state.remainingTime > 0
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-gray-800 hover:bg-gray-700'
                        } text-white`}
                    >
                        {state.remainingTime !== null && state.remainingTime > 0
                            ? `Finalize Recovery (${formatTime(state.remainingTime)})`
                            : 'Finalize Recovery'}
                    </button>
                )
            default:
                return (
                    <button
                        onClick={startRecovery}
                        className="bg-gray-800 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        Start New Recovery
                    </button>
                )
        }
    }

    return (
        <div className="min-h-screen bg-gray-100 p-8 flex flex-col items-center justify-center">
            <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg p-8">
                <h1 className="text-3xl font-semibold text-gray-800 mb-8 text-center">
                    Passkeys Recovery Demo
                </h1>

                {state.smartAccount && (
                    <div className="mb-8 p-4 bg-gray-50 rounded-lg">
                        <p className="text-gray-600 text-sm font-medium">Smart Account Address:</p>
                        <p className="text-gray-800 font-mono break-all">
                            {state.smartAccount.address}
                        </p>
                    </div>
                )}

                <div className="flex flex-col items-center gap-6">
                    {renderActionButton()}

                    {state.message && (
                        <div className="mt-2 p-2 rounded-lg bg text-gray-800 w-full text-center">
                            {state.message}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
