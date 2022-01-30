import { defaultAbiCoder } from '@ethersproject/abi'
import { getAddress } from '@ethersproject/address'
import { ChainId, createContract, TransactionEventType } from '@masknet/web3-shared-evm'
import type Web3 from 'web3'
import { AbiItem, asciiToHex, padRight, toWei } from 'web3-utils'
import { addrRepresentingThisApp } from '../../constants'
import { toChainAddress, toNativeRewardTokenDefn } from '../../SNSAdaptor/helpers'
import { Metastate, ReferralFarmsV1, ZERO_ADDR, ZERO_HASH } from '../../types'
import { getDaoAddress } from './discovery'
import { postToWomOracle, getWomOracle, createLegacyProofOfRecommandationOriginMessage } from './wom'
export const getChainId = ChainId.Rinkeby

export const farmABI = [
    {
        type: 'function',
        name: 'increaseReferralFarm',
        constant: false,
        payable: false,
        inputs: [
            {
                type: 'bytes24',
                name: 'rewardToken',
            },
            {
                type: 'bytes24',
                name: 'referredTokenDefn',
            },
            {
                type: 'uint256',
                name: 'rewardDeposit',
            },
            {
                type: 'tuple[]',
                name: 'metastate',
                components: [
                    {
                        type: 'bytes32',
                        name: 'key',
                    },
                    {
                        type: 'bytes',
                        name: 'value',
                    },
                ],
            },
        ],
        outputs: [],
    },
    {
        type: 'function',
        name: 'increaseReferralFarmNative',
        constant: false,
        stateMutability: 'payable',
        payable: true,
        inputs: [
            {
                type: 'bytes24',
                name: 'referredTokenDefn',
            },
            {
                type: 'tuple[]',
                name: 'metastate',
                components: [
                    {
                        type: 'bytes32',
                        name: 'key',
                    },
                    {
                        type: 'bytes',
                        name: 'value',
                    },
                ],
            },
        ],
        outputs: [],
    },
    {
        type: 'event',
        anonymous: false,
        name: 'FarmExists',
        inputs: [
            {
                type: 'address',
                name: 'sponsor',
                indexed: true,
            },
            {
                type: 'bytes24',
                name: 'rewardTokenDefn',
                indexed: true,
            },
            {
                type: 'bytes24',
                name: 'referredTokenDefn',
                indexed: true,
            },
            {
                type: 'bytes32',
                name: 'farmHash',
            },
        ],
    },
    {
        type: 'event',
        anonymous: false,
        name: 'FarmDepositChange',
        inputs: [
            {
                type: 'bytes32',
                name: 'farmHash',
                indexed: true,
            },
            {
                type: 'int256',
                name: 'delta',
            },
        ],
    },
    {
        type: 'event',
        anonymous: false,
        name: 'FarmTokenChange',
        inputs: [
            {
                type: 'bytes32',
                name: 'farmHash',
                indexed: true,
            },
            {
                type: 'bytes24',
                name: 'token',
                indexed: true,
            },
            {
                type: 'uint8',
                name: 'change',
            },
        ],
    },
    {
        type: 'event',
        anonymous: false,
        name: 'FarmMetastate',
        inputs: [
            {
                type: 'bytes32',
                name: 'farmHash',
                indexed: true,
            },
            {
                type: 'bytes32',
                name: 'key',
                indexed: true,
            },
            {
                type: 'bytes',
                name: 'value',
            },
        ],
    },
]

export const erc20ABI = [
    {
        inputs: [
            {
                internalType: 'address',
                name: 'spender',
                type: 'address',
            },
            {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256',
            },
        ],
        name: 'approve',
        outputs: [
            {
                internalType: 'bool',
                name: '',
                type: 'bool',
            },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
    },
]
export async function runCreateERC20PairFarm(
    onConfirm,
    onStart,
    web3: Web3,
    account: string,
    rewardTokenAddr: string,
    referredTokenAddr: string,
    totalFarmReward: number,
    dailyFarmReward: number,
) {
    try {
        onStart(true)
        let tx: any, metastate: Metastate

        const chainId = getChainId
        const referredTokenDefn = toChainAddress(chainId, referredTokenAddr)
        const rewardTokenDefn = toChainAddress(chainId, rewardTokenAddr)

        const farmsAddr = await getDaoAddress(web3, ReferralFarmsV1)
        const farms = createContract(web3, farmsAddr, farmABI as AbiItem[])

        const rewardTokenInstance = createContract(web3, rewardTokenAddr, erc20ABI as AbiItem[])
        const config = {
            from: account,
        }
        totalFarmReward = Number.parseFloat(toWei(totalFarmReward.toString(), 'ether'))
        const estimatedGas = await rewardTokenInstance?.methods.approve(farmsAddr, totalFarmReward).estimateGas(config)
        tx = await rewardTokenInstance?.methods.approve(farmsAddr, totalFarmReward).send({
            ...config,
            gas: estimatedGas,
        })

        metastate = [
            {
                key: padRight(asciiToHex('dailyRewardRate'), 64),
                value: defaultAbiCoder.encode(['uint256'], [toWei(dailyFarmReward.toString(), 'ether')]),
            },
        ]

        const estimatedGas2 = await farms?.methods
            .increaseReferralFarm(rewardTokenDefn, referredTokenDefn, totalFarmReward, metastate)
            .estimateGas(config)

        tx = await farms?.methods
            .increaseReferralFarm(rewardTokenDefn, referredTokenDefn, totalFarmReward, metastate)
            .send({
                ...config,
                gas: estimatedGas2,
            })
            .on(TransactionEventType.RECEIPT, (onSucceed) => {
                onStart(true)
            })
            .on(TransactionEventType.CONFIRMATION, (onSucceed) => {
                onConfirm(true)
            })
            .on(TransactionEventType.ERROR, (error) => {
                alert(error)
                onConfirm(false)
                onStart(false)
            })
    } catch (error) {
        onConfirm(false)
        onStart(false)
        alert(error)
    }
}

export async function runCreateNativeFarm(
    onConfirm,
    onStart,
    web3: Web3,
    account: string,
    rewardTokenAddr: string,
    referredTokenAddr: string,
    totalFarmReward: number,
    dailyFarmReward: number,
) {
    try {
        onStart(true)
        let tx: any, metastate: Metastate

        const chainId = getChainId
        const referredTokenDefn = toChainAddress(chainId, referredTokenAddr)
        const rewardTokenDefn = toNativeRewardTokenDefn(chainId)
        const farmsAddr = await getDaoAddress(web3, ReferralFarmsV1)
        const farms = createContract(web3, farmsAddr, farmABI as AbiItem[])
        metastate = [
            {
                key: padRight(asciiToHex('dailyRewardRate'), 64),
                value: defaultAbiCoder.encode(['uint256'], [toWei(dailyFarmReward.toString(), 'ether')]),
            },
        ]

        const config = {
            from: account,
            value: toWei(totalFarmReward.toString(), 'ether'),
        }
        const estimatedGas = await farms?.methods
            .increaseReferralFarmNative(referredTokenDefn, metastate)
            .estimateGas(config)

        tx = await farms?.methods
            .increaseReferralFarmNative(referredTokenDefn, metastate)
            .send({
                ...config,
                gas: estimatedGas,
            })
            .on(TransactionEventType.RECEIPT, (onSucceed) => {
                onStart(true)
            })
            .on(TransactionEventType.CONFIRMATION, (onSucceed) => {
                onConfirm(true)
            })
            .on(TransactionEventType.ERROR, (error) => {
                onConfirm(false)
                onStart(false)
            })
    } catch (error) {
        onConfirm(false)
        onStart(false)
        alert(error)
    }
}

export async function runCreateReferralLink(web3: Web3, account: string, token: string, dapp = '') {
    const host = await getWomOracle()

    const { time, sig: timePromise } = await postToWomOracle(host, '/v4/time-promise', {
        signer: account,
        token,
        dapp: ZERO_HASH,
        referrer: ZERO_ADDR,
        router: addrRepresentingThisApp,
    })
    const sig = await web3.eth.personal.sign(
        createLegacyProofOfRecommandationOriginMessage(account, token, time, addrRepresentingThisApp, timePromise),
        account,
        '',
    )

    // Post signed proof of recommendation origin
    const commitment = await postToWomOracle(host, '/v4/proofs', {
        data: {
            signer: getAddress(account),
            token: getAddress(token),
            referrer: ZERO_ADDR,
            dapp: ZERO_HASH,
            router: getAddress(addrRepresentingThisApp),
            time,
            timePromise,
            sig,
        },
        linkReferrer: '',
    })
}