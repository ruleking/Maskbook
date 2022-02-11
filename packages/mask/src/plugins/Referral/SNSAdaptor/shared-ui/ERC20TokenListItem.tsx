/* eslint-disable prettier/prettier */
import { Box, ListItem, ListItemIcon, ListItemText, Typography } from '@mui/material'
import classNames from 'classnames'
import { v4 as uuid } from 'uuid'
import { Asset, currySameAddress, FungibleTokenDetailed, isSameAddress } from '@masknet/web3-shared-evm'
import { TokenIcon, LoadingAnimation } from '@masknet/shared'
import type { MaskSearchableListItemProps } from '@masknet/theme'
import { makeStyles } from '@masknet/theme'
import { some } from 'lodash-unified'
import { useMemo } from 'react'
import { Icons, TokensGroupedByType, ChainAddress } from '../../types'
import { toChainAddress, getTokenTypeIcons } from '../helpers'
import { SvgIcons } from '../Icons'

const useStyles = makeStyles()((theme) => ({
    icon: {
        width: 36,
        height: 36,
    },
    list: {
        maxHeight: '100%',
        padding: theme.spacing(1.5),
        borderRadius: theme.spacing(1),
    },
    text: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    primary: {
        flex: 1,
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        paddingRight: theme.spacing(1),
    },
    name: {
        display: 'block',
        lineHeight: '20px',
        fontSize: 16,
        // TODO: Should align dashboard and twitter theme in common component, depend twitter theme
        color: theme.palette.mode === 'dark' ? '#6E767D' : '#536471',
    },
    symbol: {
        lineHeight: '20px',
        fontSize: 16,
    },
    import: {
        '&:before': {
            content: '""',
            display: 'inline-block',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'transparent',
        },
    },
    importButton: {
        padding: '3px 0',
        borderRadius: 15,
        fontSize: 14,
        fontWeight: 500,
        lineHeight: '20px',
    },
    metaInfo: {
        display: 'flex',
        alignItems: 'center',
    },
    typeIcon: {
        marginLeft: '5px',
    },
}))

export const getERC20TokenListItem =
    (
        addedTokens: FungibleTokenDetailed[],
        externalTokens: FungibleTokenDetailed[],
        info: {
            from: 'search' | 'defaultList'
            inList: boolean
        },
        selectedTokens: string[],
        loadingAsset: boolean,
        tokensGroupedByType: TokensGroupedByType,
        referredTokensAPR?: Map<ChainAddress, { APR?: number }>,
    ) =>
    ({ data, onSelect }: MaskSearchableListItemProps<Asset>) => {
        const { classes } = useStyles()
        const token = data.token

        if (!token) return null

        const { address, name, symbol, logoURI, chainId } = token
        const isNotAdded = some(externalTokens, (t: any) => isSameAddress(address, t.address))
        const isAdded = some(addedTokens, (t: any) => isSameAddress(address, t.address))

        const handleTokenSelect = (e: React.MouseEvent<HTMLElement>) => {
            e.stopPropagation()
            onSelect(data)
        }

        const tokenChainAddr = toChainAddress(chainId, address)
        const tokenTypeIcons = getTokenTypeIcons(tokenChainAddr, tokensGroupedByType)
        const noFarmForToken = tokenTypeIcons.length === 0
        const referredTokenAPRValue = referredTokensAPR?.get(tokenChainAddr)?.APR
        const referredTokenAPR = referredTokenAPRValue ? (
            `${Number.parseFloat((referredTokenAPRValue * 100).toFixed(2))}%`
        ) : (
            <span>&#8734;</span>
        )

        const action = useMemo(() => {
            return !isNotAdded || isAdded || (info.inList && info.from === 'search') ? (
                noFarmForToken ? (
                    '-'
                ) : (
                    <span>{loadingAsset ? <LoadingAnimation /> : referredTokenAPR}</span>
                )
            ) : null
        }, [info, isNotAdded, isAdded, data.balance])

        return (
            <ListItem
                button
                className={`${classes.list} dashboard token-list`}
                onClick={handleTokenSelect}
                disabled={selectedTokens.some(currySameAddress(address))}>
                <ListItemIcon>
                    <TokenIcon classes={{ icon: classes.icon }} address={address} name={name} logoURI={logoURI} />
                </ListItemIcon>
                <ListItemText classes={{ primary: classes.text }}>
                    <Typography
                        className={classNames(classes.primary, isNotAdded ? classes.import : '')}
                        color="textPrimary"
                        component="span">
                        <div className={classes.metaInfo}>
                            <span className={classes.symbol}>{symbol}</span>{' '}
                            {noFarmForToken && (
                                <Box className={classes.typeIcon}>
                                    <SvgIcons icon={Icons.UnderReviewIcon} size={16} />
                                </Box>
                            )}
                            {tokenTypeIcons.map((icon) => (
                                <Box className={classes.typeIcon} key={uuid()}>
                                    <SvgIcons icon={icon} size={16} />
                                </Box>
                            ))}
                        </div>
                        <span className={`${classes.name} dashboard token-list-symbol`}>
                            {name}
                            {isAdded && <span> &bull; Added By User</span>}
                        </span>
                    </Typography>
                    <Typography sx={{ fontSize: 16 }} color="textSecondary" component="span">
                        {action}
                    </Typography>
                </ListItemText>
            </ListItem>
        )
    }