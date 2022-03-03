import { useCallback, useState } from 'react'
import { Typography, Box, Tab, Tabs, Grid, TextField, Chip, InputAdornment, Divider } from '@mui/material'
import { TabContext, TabPanel } from '@mui/lab'

import { useI18N } from '../../../utils'
import {
    EthereumTokenType,
    formatBalance,
    FungibleTokenDetailed,
    useAccount,
    useChainId,
    useFungibleTokenBalance,
    useWeb3,
} from '@masknet/web3-shared-evm'
import { isDashboardPage } from '@masknet/shared-base'
import { makeStyles } from '@masknet/theme'
import { TabsCreateFarm, TokenType, TransactionStatus, PageInterface, PagesType, TabsReferralFarms } from '../types'
import ActionButton from '../../../extension/options-page/DashboardComponents/ActionButton'
import { EthereumChainBoundary } from '../../../web3/UI/EthereumChainBoundary'
import { CreatedFarms } from './CreatedFarms'
import { TokenSelectField } from './shared-ui/TokenSelectField'

import { FormattedBalance, useRemoteControlledDialog } from '@masknet/shared'
import { WalletMessages } from '@masknet/plugin-wallet'
import { v4 as uuid } from 'uuid'

import { blue } from '@mui/material/colors'
import { ATTRACE_FEE_PERCENT, NATIVE_TOKEN, REFERRAL_META_KEY } from '../constants'
import { useCompositionContext } from '@masknet/plugin-infra'

import { useCurrentIdentity } from '../../../components/DataSource/useActivatedUI'
import { runCreateERC20PairFarm } from '../Worker/apis/referralFarm'
import { PluginReferralMessages, SelectTokenUpdated } from '../messages'
import BigNumber from 'bignumber.js'
import { useRequiredChainId } from './hooks/useRequiredChainId'
import { useSharedStyles, useTabStyles } from './styles'

const useStyles = makeStyles<{ isDashboard: boolean }>()((theme, { isDashboard }) => ({
    walletStatusBox: {
        width: 535,
        margin: '24px auto',
    },
    bold: {},
    normal: {},
    container: {
        flex: 1,
        height: '100%',
    },
    tab: {
        maxHeight: '100%',
        height: '100%',
        overflow: 'auto',
        padding: `${theme.spacing(3)} 0`,
    },
    tabs: {
        width: '288px',
    },
    chip: {
        width: '150px',
        height: '40px',

        flexDirection: 'row',
    },
    linkText: {
        color: blue[50],
    },
    heading: {
        fontSize: '20px',
        fontWeight: 'bold',
    },
    balance: {
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        maxWidth: '80%',
        fontSize: 12,
        top: theme.spacing(0.5),
    },
    textField: {
        '& input[type=number]': {
            '-moz-appearance': 'textfield',
        },
        '& input[type=number]::-webkit-outer-spin-button': {
            '-webkit-appearance': 'none',
            margin: 0,
        },
        '& input[type=number]::-webkit-inner-spin-button': {
            '-webkit-appearance': 'none',
            margin: 0,
        },
    },
}))

export function CreateFarm(props: PageInterface) {
    const { t } = useI18N()
    const isDashboard = isDashboardPage()
    const { classes } = useStyles({ isDashboard })
    const { classes: tabClasses } = useTabStyles()
    const { classes: sharedClasses } = useSharedStyles()
    const currentChainId = useChainId()

    const requiredChainId = useRequiredChainId(currentChainId)

    const [tab, setTab] = useState<string>(TabsCreateFarm.NEW)

    // #region select token
    const [token, setToken] = useState<FungibleTokenDetailed>()
    const {
        value: rewardBalance = '0',
        loading: loadingRewardBalance,
        retry: retryLoadRewardBalance,
    } = useFungibleTokenBalance(token?.type ?? EthereumTokenType.Native, token?.address ?? '')

    // const [transactionState, setTransactionState] = useState<TransactionState | null>(null)
    const [dailyFarmReward, setDailyFarmReward] = useState<string>('')
    const [totalFarmReward, setTotalFarmReward] = useState<string>('')
    const [attraceFee, setAttraceFee] = useState<BigNumber>(new BigNumber(0))
    const [id] = useState(uuid())
    const [focusedTokenPanelType, setFocusedTokenPanelType] = useState(TokenType.REFER)

    const web3 = useWeb3()
    const account = useAccount()
    const { attachMetadata, dropMetadata } = useCompositionContext()
    const currentIdentity = useCurrentIdentity()
    const senderName = currentIdentity?.identifier.userId ?? currentIdentity?.linkedPersona?.nickname ?? 'Unknown User'

    const { closeDialog: closeWalletStatusDialog } = useRemoteControlledDialog(
        WalletMessages.events.walletStatusDialogUpdated,
    )

    const onDeposit = useCallback(async () => {
        if (!token?.address || !token?.address) {
            return alert('TOKEN DID NOT SELECT')
        }

        if (token.address !== NATIVE_TOKEN) {
            const { address: tokenAddr } = token
            const totalFarmRewardNum = new BigNumber(totalFarmReward).plus(attraceFee)
            const dailyFarmRewardNum = new BigNumber(dailyFarmReward)

            await runCreateERC20PairFarm(
                (val: boolean) => {
                    if (!val) {
                        onErrorDeposit()
                    }
                },
                (val: boolean) => {
                    if (val) {
                        onConfirmDeposit()
                    } else {
                        onErrorDeposit()
                    }
                },
                (txHash: string) => {
                    onConfirmedDeposit(txHash)
                },
                web3,
                account,
                currentChainId,
                tokenAddr,
                tokenAddr,
                totalFarmRewardNum,
                dailyFarmRewardNum,
            )
        } else {
            alert("CAN'T CREATE NATIVE TOKEN FARM")
        }
    }, [web3, account, currentChainId, token, totalFarmReward, dailyFarmReward])

    const onInsertData = useCallback(
        (token?: FungibleTokenDetailed) => {
            if (!token?.address) {
                return alert('REFERRED TOKEN DID NOT SELECT')
            }

            const { address, name = '', symbol = '', logoURI = [''] } = token
            const selectedReferralData = {
                referral_token: address,
                referral_token_name: name,
                referral_token_symbol: symbol,
                referral_token_icon: logoURI,
                referral_token_chain_id: currentChainId,
                sender: senderName ?? '',
            }
            if (selectedReferralData) {
                attachMetadata(REFERRAL_META_KEY, JSON.parse(JSON.stringify(selectedReferralData)))
            } else {
                dropMetadata(REFERRAL_META_KEY)
            }

            closeWalletStatusDialog()
            props.onClose?.()
        },
        [token],
    )

    const onUpdateByRemote = useCallback(
        (ev: SelectTokenUpdated) => {
            if (ev.open || !ev.token || ev.uuid !== id) return
            setToken(ev.token)
        },
        [id, setToken],
    )

    const { setDialog: setSelectTokenDialog } = useRemoteControlledDialog(
        PluginReferralMessages.selectTokenUpdated,
        onUpdateByRemote,
    )

    const onTokenSelectClick = useCallback(
        (type: TokenType, title: string) => {
            setFocusedTokenPanelType(type)
            setSelectTokenDialog({
                open: true,
                uuid: id,
                title: title,
            })
        },
        [id, focusedTokenPanelType],
    )
    // #endregion

    const clickCreateFarm = useCallback(() => {
        if (token?.address !== NATIVE_TOKEN) {
            onCreateFarm()
        } else {
            alert("CAN'T CREATE NATIVE TOKEN FARM")
        }
    }, [token, totalFarmReward, dailyFarmReward])

    const onChangeTotalFarmReward = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const totalFarmReward = e.currentTarget.value
        const totalFarmRewardNum = new BigNumber(totalFarmReward)
        const attraceFee = totalFarmRewardNum.multipliedBy(ATTRACE_FEE_PERCENT).dividedBy(100)

        setTotalFarmReward(totalFarmReward)
        setAttraceFee(attraceFee)
    }, [])

    const onCreateFarm = useCallback(() => {
        props.continue(
            PagesType.CREATE_FARM,
            PagesType.DEPOSIT,
            TabsReferralFarms.TOKENS + ': ' + PagesType.CREATE_FARM,
            {
                hideAttrLogo: true,
                depositDialog: {
                    deposit: {
                        totalFarmReward: totalFarmReward,
                        tokenSymbol: token?.symbol,
                        attraceFee: attraceFee,
                        requiredChainId: requiredChainId,
                        onDeposit: onDeposit,
                    },
                },
            },
        )
    }, [props, attraceFee, totalFarmReward, token, requiredChainId])

    const onConfirmDeposit = useCallback(() => {
        props?.onChangePage?.(PagesType.TRANSACTION, t('plugin_referral_transaction'), {
            hideAttrLogo: true,
            hideBackBtn: true,
            transactionDialog: {
                transaction: {
                    status: TransactionStatus.CONFIRMATION,
                    title: t('plugin_referral_transaction_confirm_permission_deposit'),
                    subtitle: t('plugin_referral_create_farm_transaction_confirm_desc', {
                        reward: attraceFee.plus(totalFarmReward),
                        token: token?.symbol ?? '',
                    }),
                },
            },
        })
    }, [props, attraceFee, totalFarmReward, token])

    const onConfirmedDeposit = useCallback(
        (txHash: string) => {
            props?.onChangePage?.(PagesType.TRANSACTION, t('plugin_referral_transaction'), {
                hideAttrLogo: true,
                hideBackBtn: true,
                transactionDialog: {
                    transaction: {
                        status: TransactionStatus.CONFIRMED,
                        actionButton: {
                            label: t('plugin_referral_publish_farm'),
                            onClick: () => onInsertData(token),
                        },
                        transactionHash: txHash,
                    },
                },
            })
        },
        [props, token],
    )

    const onErrorDeposit = useCallback(() => {
        props?.onChangePage?.(PagesType.CREATE_FARM, TabsReferralFarms.TOKENS + ': ' + PagesType.CREATE_FARM)
    }, [props])

    const rewardDataFields = () => {
        return (
            <>
                <Grid item xs={6} display="flex">
                    <Box>
                        <TextField
                            label={t('plugin_referral_daily_farm_reward')}
                            value={dailyFarmReward}
                            placeholder="0"
                            onChange={(e) => setDailyFarmReward(e.currentTarget.value)}
                            inputMode="numeric"
                            type="number"
                            InputLabelProps={{
                                shrink: true,
                            }}
                            variant="standard"
                            className={classes.textField}
                            InputProps={{
                                disableUnderline: true,
                                endAdornment: <InputAdornment position="end">{token?.symbol}</InputAdornment>,
                            }}
                        />
                    </Box>
                </Grid>
                <Grid item xs={6} display="flex" alignItems="end">
                    <Box justifyContent="center">
                        <TextField
                            label={t('plugin_referral_total_farm_rewards')}
                            value={totalFarmReward}
                            inputMode="numeric"
                            type="number"
                            placeholder="0"
                            onChange={onChangeTotalFarmReward}
                            InputLabelProps={{
                                shrink: true,
                            }}
                            variant="standard"
                            className={classes.textField}
                            InputProps={{
                                disableUnderline: true,
                                endAdornment: (
                                    <InputAdornment position="start">
                                        <Grid container>
                                            <Grid item container>
                                                <Box>
                                                    <Typography
                                                        className={classes.balance}
                                                        color="textSecondary"
                                                        variant="body2"
                                                        component="span">
                                                        {t('wallet_balance')}:{' '}
                                                        {token ? (
                                                            <FormattedBalance
                                                                value={rewardBalance ?? '0'}
                                                                decimals={token?.decimals}
                                                                significant={6}
                                                                formatter={formatBalance}
                                                            />
                                                        ) : (
                                                            '-'
                                                        )}
                                                    </Typography>
                                                </Box>
                                            </Grid>
                                            {token ? (
                                                <Grid item container>
                                                    <Grid item xs={6}>
                                                        {token?.symbol}
                                                    </Grid>
                                                    <Grid item xs={6}>
                                                        <Chip
                                                            size="small"
                                                            label="MAX"
                                                            clickable
                                                            color="primary"
                                                            variant="outlined"
                                                            className={sharedClasses.maxChip}
                                                            onClick={() => {
                                                                setTotalFarmReward(
                                                                    formatBalance(
                                                                        rewardBalance ?? '',
                                                                        token?.decimals,
                                                                        6,
                                                                    ),
                                                                )
                                                            }}
                                                        />
                                                    </Grid>
                                                </Grid>
                                            ) : null}
                                        </Grid>
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </Box>
                </Grid>
            </>
        )
    }
    const createFarmBtnDisabled =
        !token?.address || !token?.address || !Number(totalFarmReward) || !Number(dailyFarmReward)

    return (
        <div>
            <Box className={classes.container}>
                <TabContext value={String(tab)}>
                    <Tabs
                        value={tab}
                        centered
                        variant="fullWidth"
                        onChange={(e, v) => setTab(v)}
                        aria-label="persona-post-contacts-button-group">
                        <Tab value={TabsCreateFarm.NEW} label="New" classes={tabClasses} />
                        <Tab value={TabsCreateFarm.CREATED} label="Created" classes={tabClasses} />
                    </Tabs>
                    <TabPanel value={TabsCreateFarm.NEW} className={classes.tab}>
                        <Typography>
                            <Grid container rowSpacing={3}>
                                <Grid item>
                                    <Typography fontWeight={600} variant="h6">
                                        {t('plugin_referral_create_referral_farm_desc')}
                                    </Typography>
                                </Grid>
                                <Grid item>{t('plugin_referral_select_a_token_desc')}</Grid>
                                <Grid
                                    item
                                    container
                                    justifyContent="space-around"
                                    display="flex"
                                    alignItems="flex-start"
                                    rowSpacing="24px">
                                    <Grid item xs={6} justifyContent="center" display="flex">
                                        <TokenSelectField
                                            label={t('plugin_referral_token_to_refer')}
                                            token={token}
                                            onClick={() => {
                                                onTokenSelectClick(
                                                    TokenType.REFER,
                                                    t('plugin_referral_select_a_token_to_refer'),
                                                )
                                            }}
                                        />
                                    </Grid>
                                    <Grid item xs={6} display="flex" />
                                    <Grid item xs={12} padding={0}>
                                        <Divider />
                                    </Grid>
                                    {rewardDataFields()}
                                </Grid>

                                <Grid item xs={12}>
                                    <EthereumChainBoundary
                                        chainId={requiredChainId}
                                        noSwitchNetworkTip
                                        classes={{ switchButton: sharedClasses.switchButton }}>
                                        <ActionButton
                                            fullWidth
                                            variant="contained"
                                            size="large"
                                            disabled={createFarmBtnDisabled}
                                            onClick={() => {
                                                clickCreateFarm()
                                            }}>
                                            {t('plugin_referral_create_referral_farm')}
                                        </ActionButton>
                                    </EthereumChainBoundary>
                                </Grid>
                            </Grid>
                        </Typography>
                    </TabPanel>
                    <TabPanel value={TabsCreateFarm.CREATED} className={classes.tab}>
                        <CreatedFarms continue={props.continue} />
                    </TabPanel>
                </TabContext>
            </Box>
        </div>
    )
}
