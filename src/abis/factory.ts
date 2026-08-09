// GENERATED FILE — DO NOT EDIT.
//
// Source: CashCatFactoryVNext.sol, via `npm run sync:abis`.
// Any hand edit is lost on the next contract change, and a hand-edited ABI
// that disagrees with deployed bytecode decodes silently rather than failing.
export const factoryAbi = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
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
    "name": "FIRST_CONFIG_ID",
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
    "name": "MAX_FEE_RATE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint24",
        "internalType": "uint24"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_QUOTE_DECIMALS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MODULE_GENERATION",
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
    "name": "PIPS_PER_BP",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint24",
        "internalType": "uint24"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UPGRADE_INTERFACE_VERSION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
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
    "name": "approvedQuote",
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
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "configCount",
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
    "name": "currentSplitterOf",
    "inputs": [
      {
        "name": "poolId",
        "type": "bytes32",
        "internalType": "PoolId"
      }
    ],
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
    "name": "firstConfigId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "getLaunchConfig",
    "inputs": [
      {
        "name": "configId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct CashCatFactoryVNext.LaunchConfig",
        "components": [
          {
            "name": "moduleSetId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "quote",
            "type": "address",
            "internalType": "Currency"
          },
          {
            "name": "supply",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "tickSpacing",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "startTick",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "creatorFeeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "feeRate",
            "type": "uint24",
            "internalType": "uint24"
          },
          {
            "name": "enabled",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "selfBurn",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "exists",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getModuleSet",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct CashCatFactoryVNext.ModuleSet",
        "components": [
          {
            "name": "hook",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "tokenMaster",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "selfBurner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "splitterMaster",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "exists",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "initializeVNext",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "launch",
    "inputs": [
      {
        "name": "params",
        "type": "tuple",
        "internalType": "struct CashCatFactoryVNext.TokenParams",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "symbol",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "logo",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "description",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "metadataURI",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "socials",
            "type": "tuple",
            "internalType": "struct CashCatTokenV2.Socials",
            "components": [
              {
                "name": "telegram",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "twitter",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "discord",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "website",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "extra",
                "type": "string",
                "internalType": "string"
              }
            ]
          },
          {
            "name": "creator",
            "type": "address",
            "internalType": "address"
          }
        ]
      },
      {
        "name": "configId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "firstBuyIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "firstBuyMinOut",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "poolId",
        "type": "bytes32",
        "internalType": "PoolId"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "launchConfigCount",
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
    "name": "launchEnabled",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "launchFee",
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
    "name": "launchSplitterOf",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "PoolId"
      }
    ],
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
    "name": "launchWithFeeSplit",
    "inputs": [
      {
        "name": "params",
        "type": "tuple",
        "internalType": "struct CashCatFactoryVNext.TokenParams",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "symbol",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "logo",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "description",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "metadataURI",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "socials",
            "type": "tuple",
            "internalType": "struct CashCatTokenV2.Socials",
            "components": [
              {
                "name": "telegram",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "twitter",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "discord",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "website",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "extra",
                "type": "string",
                "internalType": "string"
              }
            ]
          },
          {
            "name": "creator",
            "type": "address",
            "internalType": "address"
          }
        ]
      },
      {
        "name": "configId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "firstBuyIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "firstBuyMinOut",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "recipients",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "shares",
        "type": "uint16[]",
        "internalType": "uint16[]"
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "poolId",
        "type": "bytes32",
        "internalType": "PoolId"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "launchWithPermit",
    "inputs": [
      {
        "name": "params",
        "type": "tuple",
        "internalType": "struct CashCatFactoryVNext.TokenParams",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "symbol",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "logo",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "description",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "metadataURI",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "socials",
            "type": "tuple",
            "internalType": "struct CashCatTokenV2.Socials",
            "components": [
              {
                "name": "telegram",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "twitter",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "discord",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "website",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "extra",
                "type": "string",
                "internalType": "string"
              }
            ]
          },
          {
            "name": "creator",
            "type": "address",
            "internalType": "address"
          }
        ]
      },
      {
        "name": "configId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "firstBuyIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "firstBuyMinOut",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "recipients",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "shares",
        "type": "uint16[]",
        "internalType": "uint16[]"
      },
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct CashCatFactoryVNext.Permit",
        "components": [
          {
            "name": "value",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "v",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "r",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "s",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "poolId",
        "type": "bytes32",
        "internalType": "PoolId"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "mineSalt",
    "inputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct CashCatFactoryVNext.TokenParams",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "symbol",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "logo",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "description",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "metadataURI",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "socials",
            "type": "tuple",
            "internalType": "struct CashCatTokenV2.Socials",
            "components": [
              {
                "name": "telegram",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "twitter",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "discord",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "website",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "extra",
                "type": "string",
                "internalType": "string"
              }
            ]
          },
          {
            "name": "creator",
            "type": "address",
            "internalType": "address"
          }
        ]
      },
      {
        "name": "configId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "start",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "rounds",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "moduleSetCount",
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
    "name": "nextConfigId",
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
    "name": "poolManager",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPoolManager"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "predictTokenAddress",
    "inputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct CashCatFactoryVNext.TokenParams",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "symbol",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "logo",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "description",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "metadataURI",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "socials",
            "type": "tuple",
            "internalType": "struct CashCatTokenV2.Socials",
            "components": [
              {
                "name": "telegram",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "twitter",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "discord",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "website",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "extra",
                "type": "string",
                "internalType": "string"
              }
            ]
          },
          {
            "name": "creator",
            "type": "address",
            "internalType": "address"
          }
        ]
      },
      {
        "name": "configId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
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
    "name": "proxiableUUID",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "publishConfig",
    "inputs": [
      {
        "name": "config",
        "type": "tuple",
        "internalType": "struct CashCatFactoryVNext.LaunchConfig",
        "components": [
          {
            "name": "moduleSetId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "quote",
            "type": "address",
            "internalType": "Currency"
          },
          {
            "name": "supply",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "tickSpacing",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "startTick",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "creatorFeeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "feeRate",
            "type": "uint24",
            "internalType": "uint24"
          },
          {
            "name": "enabled",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "selfBurn",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "exists",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "configId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "publishModuleSet",
    "inputs": [
      {
        "name": "hook_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenMaster",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "selfBurner_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "splitterMaster",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "publishedConfigCount",
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
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "rescueToken",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
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
    "name": "retiredConfigCount",
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
    "name": "retiredPointers",
    "inputs": [],
    "outputs": [
      {
        "name": "hook",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "burner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "master",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "distributor",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setApprovedQuote",
    "inputs": [
      {
        "name": "quote",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "approved",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setLaunchConfigEnabled",
    "inputs": [
      {
        "name": "configId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "enabled",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setLaunchEnabled",
    "inputs": [
      {
        "name": "enabled",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setLaunchFee",
    "inputs": [
      {
        "name": "newFee",
        "type": "uint256",
        "internalType": "uint256"
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
    "name": "sweep",
    "inputs": [],
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
    "name": "unlockCallback",
    "inputs": [
      {
        "name": "rawData",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "upgradeToAndCall",
    "inputs": [
      {
        "name": "newImplementation",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "event",
    "name": "FeeSplitterDeployed",
    "inputs": [
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "PoolId"
      },
      {
        "name": "splitter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "recipients",
        "type": "address[]",
        "indexed": false,
        "internalType": "address[]"
      },
      {
        "name": "shares",
        "type": "uint16[]",
        "indexed": false,
        "internalType": "uint16[]"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Initialized",
    "inputs": [
      {
        "name": "version",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LaunchConfigAdded",
    "inputs": [
      {
        "name": "configId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "config",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct CashCatFactoryVNext.LaunchConfig",
        "components": [
          {
            "name": "moduleSetId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "quote",
            "type": "address",
            "internalType": "Currency"
          },
          {
            "name": "supply",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "tickSpacing",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "startTick",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "creatorFeeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "feeRate",
            "type": "uint24",
            "internalType": "uint24"
          },
          {
            "name": "enabled",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "selfBurn",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "exists",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LaunchConfigEnabled",
    "inputs": [
      {
        "name": "configId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "enabled",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LaunchEnabledUpdated",
    "inputs": [
      {
        "name": "enabled",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LaunchFeeUpdated",
    "inputs": [
      {
        "name": "oldFee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newFee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MigratedToVNext",
    "inputs": [
      {
        "name": "retiredConfigCount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "firstConfigId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ModuleSetPublished",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "modules",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct CashCatFactoryVNext.ModuleSet",
        "components": [
          {
            "name": "hook",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "tokenMaster",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "selfBurner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "splitterMaster",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "exists",
            "type": "bool",
            "internalType": "bool"
          }
        ]
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
    "name": "QuoteApprovalUpdated",
    "inputs": [
      {
        "name": "quote",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "approved",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TokenLaunched",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "PoolId"
      },
      {
        "name": "configId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "firstBuyIn",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "firstBuyOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "hook",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "feeRecipient",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TokenLaunchedVNext",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "PoolId"
      },
      {
        "name": "quote",
        "type": "address",
        "indexed": false,
        "internalType": "Currency"
      },
      {
        "name": "moduleSetId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "splitter",
        "type": "address",
        "indexed": false,
        "internalType": "address"
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
    "type": "event",
    "name": "Upgraded",
    "inputs": [
      {
        "name": "implementation",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AddressEmptyCode",
    "inputs": [
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "BurnerMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BurnerNotSet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ConfigDisabled",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CreatorMustBeSender",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ERC1967InvalidImplementation",
    "inputs": [
      {
        "name": "implementation",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1967NonPayable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EmptyString",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailedCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailedDeployment",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FeeRouteForbidden",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FeeTransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FirstBuySlippage",
    "inputs": []
  },
  {
    "type": "error",
    "name": "IncorrectValue",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientBalance",
    "inputs": [
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidConfig",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidConfigId",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidFeeRoute",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidInitialization",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LaunchesPaused",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ModuleMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAContract",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotInitialized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotInitializing",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotPoolManager",
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
    "name": "PermitFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PermitNotApplicable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PermitValueMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "QuoteDecimalsTooLow",
    "inputs": [
      {
        "name": "decimals",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "QuoteDecimalsUnreadable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "QuoteMustSortFirst",
    "inputs": []
  },
  {
    "type": "error",
    "name": "QuoteNotApproved",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Reentrancy",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "SaltNotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SeedLiquidityAboveTickCap",
    "inputs": [
      {
        "name": "seedLiquidity",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "cap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SelfPayment",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SplitterNotSet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SupplyOutOfRange",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TreasuryCannotHoldTokens",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UUPSUnauthorizedCallContext",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UUPSUnsupportedProxiableUUID",
    "inputs": [
      {
        "name": "slot",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnknownModuleSet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "VanityAddressRequired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;
