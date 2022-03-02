import React, { useCallback, useMemo } from 'react'
import { Box, Typography, Theme } from '@mui/material'
import { makeStyles, useStylesExtends } from '@masknet/theme'
import type { SxProps } from '@mui/system'
import { NetworkPluginID, useActivatedPlugin, usePluginIDContext } from '@masknet/plugin-infra'
import {
    ChainId,
    getChainDetailedCAIP,
    getChainName,
    getNetworkTypeFromChainId,
    isChainIdValid,
    NetworkType,
    ProviderType,
    resolveNetworkName,
    useAccount,
    useAllowTestnet,
    useChainId,
} from '@masknet/web3-shared-evm'
import ActionButton, {
    useValueRef,
    useRemoteControlledDialog,
    ActionButtonPromise,
    ActionButtonPromiseProps,
} from '@masknet/shared'
import { delay } from '@dimensiondev/kit'

import { useSwitchEthereumChain } from '../hook/useSwitchEthereumChain'
import { useAddEthereumChain } from '../hook/useAddEthereumChain'
import { useGetChainId } from '../hook/useGetChainId'
import { sharedProviderType } from '../../contexts'
import { useSharedI18N } from '../../locales/i18n_generated'
import { PluginServices, PluginMessages } from '../API'

const useStyles = makeStyles()(() => ({}))

export interface EthereumChainBoundaryProps extends withClasses<'switchButton'> {
    className?: string
    chainId: ChainId
    noSwitchNetworkTip?: boolean
    disablePadding?: boolean
    switchButtonStyle?: SxProps<Theme>
    children?: React.ReactNode
    isValidChainId?: (actualChainId: ChainId, expectedChainId: ChainId) => boolean
    ActionButtonPromiseProps?: Partial<ActionButtonPromiseProps>
    switchToPlugin?: () => Promise<void>
}

export function EthereumChainBoundary(props: EthereumChainBoundaryProps) {
    const t = useSharedI18N()

    const pluginID = usePluginIDContext()
    const plugin = useActivatedPlugin(pluginID, 'any')

    const account = useAccount()
    const chainId = useChainId()
    const allowTestnet = useAllowTestnet()
    const providerType = useValueRef(sharedProviderType)

    const { noSwitchNetworkTip = false } = props
    const classes = useStylesExtends(useStyles(), props)
    const expectedChainId = props.chainId
    const expectedNetwork = getChainName(expectedChainId)
    const overrides = useMemo(() => {
        return {
            chainId: expectedChainId,
            providerType: providerType as ProviderType,
        }
    }, [chainId, providerType])
    const [, switchEthereumChain] = useSwitchEthereumChain(overrides)
    const [, addEthereumChain] = useAddEthereumChain(overrides)
    const [, getChainId] = useGetChainId(overrides)

    const actualChainId = chainId
    const actualNetwork = getChainName(actualChainId)

    // if false then it will not guide the user to switch the network
    const isAllowed = isChainIdValid(expectedChainId, allowTestnet) && !!account && providerType !== ProviderType.Coin98

    // is the actual chain id matched with the expected one?
    const isChainMatched = actualChainId === expectedChainId
    const isPluginMatched = pluginID === NetworkPluginID.PLUGIN_EVM

    // is the actual chain id a valid one even if it does not match with the expected one?
    const isValid = props?.isValidChainId?.(actualChainId, expectedChainId) ?? false

    const { switchToPlugin } = props

    const onSwitchChain = useCallback(async () => {
        // a short time loading makes the user fells better
        await delay(1000)

        if (!isAllowed) return

        const switchToChain = async () => {
            // read the chain detailed from the built-in chain list
            const chainDetailedCAIP = getChainDetailedCAIP(expectedChainId)
            if (!chainDetailedCAIP) throw new Error('Unknown network type.')

            // if mask wallet was used it can switch network automatically
            if (providerType === ProviderType.MaskWallet) {
                await PluginServices.updateAccount({
                    chainId: expectedChainId,
                })
                return
            }

            // request ethereum-compatible network
            const networkType = getNetworkTypeFromChainId(expectedChainId)
            if (!networkType) return
            try {
                await Promise.race([
                    (async () => {
                        await delay(30 /* seconds */ * 1000 /* milliseconds */)
                        throw new Error('Timeout!')
                    })(),
                    networkType === NetworkType.Ethereum
                        ? await switchEthereumChain(expectedChainId)
                        : await addEthereumChain(chainDetailedCAIP, account),
                ])

                // recheck
                const chainIdHex = await getChainId()
                if (Number.parseInt(chainIdHex, 16) !== expectedChainId) throw new Error('Failed to switch chain.')
            } catch {
                throw new Error(
                    `Switch Chain Error: Make sure your wallet is on the ${resolveNetworkName(networkType)} network.`,
                )
            }
        }
        /*
        const switchToPlugin = async () => {
            pluginIDSettings.value = NetworkPluginID.PLUGIN_EVM
        }
*/
        if (!isChainMatched) await switchToChain()
        if (!isPluginMatched) await switchToPlugin?.()
    }, [account, isAllowed, isChainMatched, isPluginMatched, providerType, expectedChainId, overrides])

    const { openDialog: openSelectProviderDialog } = useRemoteControlledDialog(
        PluginMessages.Wallet.selectProviderDialogUpdated,
    )

    const renderBox = (children?: React.ReactNode) => {
        return (
            <Box
                className={props.className}
                display="flex"
                flexDirection="column"
                alignItems="center"
                sx={!props.disablePadding ? { paddingTop: 1, paddingBottom: 1 } : null}>
                {children}
            </Box>
        )
    }

    if (!account)
        return renderBox(
            <>
                <Typography color="textPrimary">
                    <span>{t.plugin_wallet_connect_wallet_tip()}</span>
                </Typography>
                <ActionButton
                    variant="contained"
                    size="small"
                    sx={{ marginTop: 1.5 }}
                    onClick={openSelectProviderDialog}>
                    {t.plugin_wallet_connect_wallet()}
                </ActionButton>
            </>,
        )

    if ((isChainMatched && isPluginMatched) || isValid) return <>{props.children}</>

    if (!isAllowed)
        return renderBox(
            <Typography color="textPrimary">
                <span>
                    {t.plugin_wallet_not_available_on({
                        network: actualNetwork,
                    })}
                </span>
            </Typography>,
        )

    if (pluginID !== NetworkPluginID.PLUGIN_EVM) {
        return renderBox(
            <>
                {!noSwitchNetworkTip ? (
                    <Typography color="textPrimary">
                        <span>
                            {t.plugin_wallet_not_available_on({
                                network: plugin?.name?.fallback ?? 'Unknown Plugin',
                            })}
                        </span>
                    </Typography>
                ) : null}
                {isAllowed ? (
                    <ActionButtonPromise
                        variant="contained"
                        size="small"
                        className={classes.switchButton}
                        sx={props.switchButtonStyle ?? { marginTop: 1.5 }}
                        init={
                            <span>
                                {t.plugin_wallet_switch_network({
                                    network: expectedNetwork,
                                })}
                            </span>
                        }
                        waiting={t.plugin_wallet_switch_network_under_going({
                            network: expectedNetwork,
                        })}
                        complete={t.plugin_wallet_switch_network({
                            network: expectedNetwork,
                        })}
                        failed={t.retry()}
                        executor={onSwitchChain}
                        completeOnClick={onSwitchChain}
                        failedOnClick="use executor"
                        {...props.ActionButtonPromiseProps}
                    />
                ) : null}
            </>,
        )
    }

    return renderBox(
        <>
            {!noSwitchNetworkTip ? (
                <Typography color="textPrimary">
                    <span>
                        {t.plugin_wallet_not_available_on({
                            network: actualNetwork,
                        })}
                    </span>
                </Typography>
            ) : null}
            {isAllowed ? (
                <ActionButtonPromise
                    variant="contained"
                    size="small"
                    className={classes.switchButton}
                    sx={props.switchButtonStyle ?? { marginTop: 1.5 }}
                    init={
                        <span>
                            {t.plugin_wallet_switch_network({
                                network: expectedNetwork,
                            })}
                        </span>
                    }
                    waiting={t.plugin_wallet_switch_network_under_going({
                        network: expectedNetwork,
                    })}
                    complete={t.plugin_wallet_switch_network({
                        network: expectedNetwork,
                    })}
                    failed={t.retry()}
                    executor={onSwitchChain}
                    completeOnClick={onSwitchChain}
                    failedOnClick="use executor"
                    {...props.ActionButtonPromiseProps}
                />
            ) : null}
        </>,
    )
}