import {
    ChainAddress,
    FarmExistsEvent,
    ReferralFarmsV1,
    expandBytes24ToBytes32,
    expandEvmAddressToBytes32,
    FarmDepositChange,
    ChainId,
    Farm,
    PROPORTIONAL_FARM_REFERRED_TOKEN_DEFN,
    FARM_TYPE,
} from '../../types'
import type Web3 from 'web3'
import { keccak256 } from 'web3-utils'

import { Interface } from '@ethersproject/abi'

import { getDaoAddress } from './discovery'
import { queryIndexersWithNearestQuorum } from './indexers'
import { FARM_ABI } from './abis'

const iface = new Interface(FARM_ABI)

// Index the events name => id
const eventIds: any = {}
Object.entries(iface.events).forEach(([k, v]) => (eventIds[v.name] = keccak256(k)))

function parseEvents(items: Array<any>): Array<any> {
    const parsed = items.map((row) => {
        return iface.parseLog({
            data: row.data,
            topics: JSON.parse(row.topics),
        })
    })
    return parsed
}

function parseFarmExistsEvents(unparsed: any) {
    const parsed = parseEvents(unparsed)

    const farms: Array<FarmExistsEvent> = parsed.map((e) => {
        const { farmHash, referredTokenDefn, rewardTokenDefn, sponsor } = e.args
        return { farmHash, referredTokenDefn, rewardTokenDefn, sponsor }
    })

    return farms
}

function parseFarmDepositChangeEvents(unparsed: any) {
    const parsed = parseEvents(unparsed)

    const farms: Array<FarmDepositChange> = parsed.map((e) => {
        const { delta, farmHash } = e.args
        return { farmHash, delta }
    })

    return farms
}

interface TokenFilter {
    rewardTokens?: [ChainAddress]
    referredTokens?: [ChainAddress]
}

export async function getMyFarms(
    web3: Web3,
    account: string,
    chainId: ChainId,
    filter?: TokenFilter,
): Promise<Array<FarmExistsEvent>> {
    const farmsAddr = await getDaoAddress(web3, ReferralFarmsV1)
    // Query for existing farms and their deposits
    // TODO paging

    // Allow filtering your own tokens
    let topic3, topic4
    if (filter?.rewardTokens) {
        topic3 = filter.rewardTokens.map((t) => expandBytes24ToBytes32(t))
    }
    if (filter?.referredTokens) {
        topic4 = filter.referredTokens.map((t) => expandBytes24ToBytes32(t))
    }

    // Query indexers
    const res = await queryIndexersWithNearestQuorum({
        addresses: [farmsAddr],
        topic1: [eventIds.FarmExists],
        topic2: [expandEvmAddressToBytes32(account)],
        topic3,
        topic4,
        chainId: [chainId],
    })

    return parseFarmExistsEvents(res.items)
}

export async function getFarmsDeposits(web3: Web3): Promise<Array<FarmDepositChange>> {
    const farmsAddr = await getDaoAddress(web3, ReferralFarmsV1)

    const res = await queryIndexersWithNearestQuorum({
        addresses: [farmsAddr],
        topics: [eventIds.FarmDepositChange],
    })

    return parseFarmDepositChangeEvents(res.items)
}

function parseFarmExistsAndTokenChangeEvents(unparsed: any) {
    const parsed = parseEvents(unparsed)
    const farms: Array<Farm> = []

    const allEventsFarmExists = parsed.filter((e) => e.topic === eventIds.FarmExists)
    const allEventsFarmTokenChange = parsed.filter((e) => e.topic === eventIds.FarmTokenChange)

    allEventsFarmExists.forEach((farmExistEvent) => {
        const { farmHash, referredTokenDefn, rewardTokenDefn, sponsor } = farmExistEvent.args
        let farm: Farm = { farmHash, referredTokenDefn, rewardTokenDefn, sponsor, farmType: FARM_TYPE.PAIR_TOKEN }

        if (referredTokenDefn === PROPORTIONAL_FARM_REFERRED_TOKEN_DEFN) {
            const farmTokens: string[] = allEventsFarmTokenChange
                .filter((e) => e.args.farmHash === farmHash)
                .map((e) => e.args.token)

            farm = { ...farm, tokens: farmTokens, farmType: FARM_TYPE.PROPORTIONAL }
        }
        farms.push(farm)
    })

    return farms
}
export async function getAllFarms(web3: Web3, chainId?: ChainId, filter?: TokenFilter): Promise<Array<Farm>> {
    const farmsAddr = await getDaoAddress(web3, ReferralFarmsV1)

    // Allow filtering by tokens
    let topic3, topic4
    if (filter?.rewardTokens) {
        topic3 = filter.rewardTokens.map((t) => expandBytes24ToBytes32(t))
    }
    if (filter?.referredTokens) {
        topic4 = filter.referredTokens.map((t) => expandBytes24ToBytes32(t))
    }

    // Query indexers
    const res = await queryIndexersWithNearestQuorum({
        addresses: [farmsAddr],
        topic1: [eventIds.FarmExists, eventIds.FarmTokenChange],
        topic3,
        topic4,
        chainId: chainId ? [chainId] : [],
    })

    return parseFarmExistsAndTokenChangeEvents(res.items)
}
