/**
 * ABIs for contracts letscash does not own.
 *
 * Hand-written minimal fragments rather than full ABIs, because these are
 * third-party contracts and we only ever touch a handful of their functions.
 * Keeping them small also keeps the type-inference cost down — viem walks the
 * whole ABI to type a single call.
 *
 * Everything letscash *does* own is generated; see `scripts/sync-abis.ts`.
 */

import { parseAbi } from "viem";

/**
 * Uniswap's UniversalRouter.
 *
 * One function is all we need: `execute` takes a command byte string and a
 * matching array of encoded inputs. The v4 swap is command `0x10`, and its
 * input is an encoded (actions, params[]) pair. See `src/trade.ts`.
 */
export const universalRouterAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);

/**
 * Uniswap's v4 Quoter.
 *
 * Not a view function despite behaving like one — it simulates the swap and
 * reverts to return the answer, so it has to be called with `simulateContract`
 * rather than `readContract`.
 */
export const v4QuoterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)",
]);

/**
 * Permit2.
 *
 * Every non-native asset handed to the router is pulled through Permit2, which
 * means two approvals rather than one: the ERC-20 approves Permit2, then
 * Permit2 approves the router. Missing the second is the most common reason a
 * sell reverts with an opaque error.
 */
export const permit2Abi = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);

/** The ERC-20 surface this package reads and writes. */
export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

/**
 * EIP-2612 permit, used to make a stablecoin launch one transaction.
 *
 * `version` is optional in the standard and absent on some tokens, so read it
 * defensively and fall back to "1" — signing against the wrong domain
 * separator produces a signature that fails on chain with no useful error.
 */
export const erc2612Abi = parseAbi([
  "function nonces(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
]);
