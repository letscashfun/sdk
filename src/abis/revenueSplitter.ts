// GENERATED FILE — DO NOT EDIT.
//
// Source: CashCatRevenueSplitter.sol, via `npm run sync:abis`.
// Any hand edit is lost on the next contract change, and a hand-edited ABI
// that disagrees with deployed bytecode decodes silently rather than failing.
export const revenueSplitterAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "pool_",
        "type": "address",
        "internalType": "contract IUniswapV3Pool"
      },
      {
        "name": "poolFee_",
        "type": "uint24",
        "internalType": "uint24"
      },
      {
        "name": "cashcat_",
        "type": "address",
        "internalType": "contract IERC20"
      },
      {
        "name": "weth_",
        "type": "address",
        "internalType": "contract IWETH9"
      },
      {
        "name": "cashcatTreasury_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "burnShareBps_",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "cashcatTreasuryShareBps_",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "participants_",
        "type": "tuple[]",
        "internalType": "struct CashCatRevenueSplitter.Participant[]",
        "components": [
          {
            "name": "account",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "shareBps",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      },
      {
        "name": "maxBuyPerCall_",
        "type": "uint256",
        "internalType": "uint256"
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
    "name": "BOUNTY_BPS",
    "inputs": [],
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
    "name": "BPS_DENOMINATOR",
    "inputs": [],
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
    "name": "BURN_ADDRESS",
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
    "name": "acceptOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "allocate",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "burnShareBps",
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
    "name": "burnTank",
    "inputs": [],
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
    "name": "buyAndBurn",
    "inputs": [],
    "outputs": [
      {
        "name": "cashcatOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "buyForCashcatTreasury",
    "inputs": [],
    "outputs": [
      {
        "name": "cashcatOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cashcat",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cashcatTreasury",
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
    "name": "cashcatTreasuryShareBps",
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
    "name": "cashcatTreasuryTank",
    "inputs": [],
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
    "name": "collect",
    "inputs": [
      {
        "name": "participant",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "maxBuyPerCall",
    "inputs": [],
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
    "name": "migrate",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "owed",
    "inputs": [
      {
        "name": "",
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
    "name": "participantCount",
    "inputs": [],
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
    "name": "participants",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct CashCatRevenueSplitter.Participant[]",
        "components": [
          {
            "name": "account",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "shareBps",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
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
    "name": "pool",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IUniswapV3Pool"
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
    "name": "setCashcatTreasury",
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
    "name": "setMaxBuyPerCall",
    "inputs": [
      {
        "name": "newCap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setSplit",
    "inputs": [
      {
        "name": "burnBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "treasuryBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "newParticipants",
        "type": "tuple[]",
        "internalType": "struct CashCatRevenueSplitter.Participant[]",
        "components": [
          {
            "name": "account",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "shareBps",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "totalOwed",
    "inputs": [],
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
    "name": "unallocated",
    "inputs": [],
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
        "name": "",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "weth",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IWETH9"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Allocated",
    "inputs": [
      {
        "name": "toBurnTank",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "toTreasuryTank",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "toParticipants",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Bought",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "destination",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "ethSpent",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "cashcatOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "bounty",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CashcatTreasuryUpdated",
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
    "type": "event",
    "name": "Collected",
    "inputs": [
      {
        "name": "participant",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MaxBuyPerCallUpdated",
    "inputs": [
      {
        "name": "oldCap",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newCap",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Migrated",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
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
    "name": "SplitUpdated",
    "inputs": [
      {
        "name": "burnBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "treasuryBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "participantCount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BoughtThisBlock",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BountyPayFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuplicateParticipant",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FeeTierMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidCap",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidShare",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MigrateFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoParticipants",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotPool",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToBuy",
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
    "name": "PayoutFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TokenMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WethPayFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;
