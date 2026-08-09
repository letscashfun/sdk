// GENERATED FILE — DO NOT EDIT.
//
// Source: CashCatRevenueConverter.sol, via `npm run sync:abis`.
// Any hand edit is lost on the next contract change, and a hand-edited ABI
// that disagrees with deployed bytecode decodes silently rather than failing.
export const revenueConverterAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "weth_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "v3Factory_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "treasury_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "owner_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "MAX_SLIPPAGE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "acceptOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "convert",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "minEthOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "ethOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "convertibleNow",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingOwner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quoteFloor",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "fair",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "floor",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "routes",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "feeSource",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "pool",
        "type": "address",
        "internalType": "contract IUniswapV3Pool"
      },
      {
        "name": "tokenIsToken0",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "twapWindow",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "shortWindow",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "maxSlippageBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "maxPerCall",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setRoute",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "feeSource",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "pool",
        "type": "address",
        "internalType": "contract IUniswapV3Pool"
      },
      {
        "name": "twapWindow",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "shortWindow",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "maxSlippageBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "maxPerCall",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setTreasury",
    "inputs": [
      {
        "name": "newTreasury",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "uniswapV3SwapCallback",
    "inputs": [
      {
        "name": "amount0Delta",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "amount1Delta",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "v3Factory",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IUniswapV3Factory"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "weth",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Converted",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "caller",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tokenIn",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "ethOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "floor",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferStarted",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RouteSet",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "feeSource",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "pool",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tokenIsToken0",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "twapWindow",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "shortWindow",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "maxSlippageBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "maxPerCall",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TreasuryUpdated",
    "inputs": [
      {
        "name": "oldTreasury",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newTreasury",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ConvertedThisBlock",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EthTransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "IncompleteFill",
    "inputs": [
      {
        "name": "spent",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "requested",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidCap",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidFee",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSlippage",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidWindow",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoRoute",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotOurPool",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotTheSink",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OracleCallFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OracleNotReady",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "PoolHasNoLiquidity",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RingTooShort",
    "inputs": [
      {
        "name": "cardinality",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "needed",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "SlippageExceeded",
    "inputs": [
      {
        "name": "got",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "floor",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "T",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;
