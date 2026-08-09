// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ILetscashFactory
/// @notice Launching a token from a contract.
///
/// @dev Curated. The deployed factory also carries owner-only administration
///      and the Uniswap unlock callback; neither is useful to an integrator.
///      For the exhaustive surface, use `abis/factory.json`.
///
///      Every selector below is checked against the generated ABI in this
///      package's test suite, so this file cannot drift from the deployment.
interface ILetscashFactory {
    /// @notice Links shown on the token page. All fields may be empty.
    struct Socials {
        string telegram;
        string twitter;
        string discord;
        string website;
        string extra;
    }

    /// @notice Everything about the token that is not economics.
    /// @dev `creator` receives the fee stream unless a split is supplied.
    struct TokenParams {
        string name;
        string symbol;
        string logo;
        string description;
        string metadataURI;
        Socials socials;
        address creator;
    }

    /// @notice One row of the launch menu. Immutable once published.
    /// @dev `feeRate` is in hundredths of a basis point, so 10000 is 1%.
    ///      `creatorFeeBps` is the creator's share of that fee in basis
    ///      points; the remainder is the platform's.
    struct LaunchConfig {
        uint256 moduleSetId;
        address quote;
        uint256 supply;
        int24 tickSpacing;
        int24 startTick;
        uint16 creatorFeeBps;
        uint24 feeRate;
        bool enabled;
        bool selfBurn;
        bool exists;
    }

    /// @notice Launches a token. The fee stream goes to `params.creator`.
    /// @dev `salt` is NOT free. The factory requires the resulting token
    ///      address to carry the "cc" stamp and to sort above the quote, so it
    ///      must come from `mineSalt` — an arbitrary salt reverts. Send
    ///      `launchFee()` as value, plus `firstBuyIn` when the quote is native.
    /// @param params Token metadata and the creator.
    /// @param configId Which menu row to launch under.
    /// @param firstBuyIn Quote spent buying your own token in the same
    ///        transaction. Zero for none.
    /// @param firstBuyMinOut Slippage floor on that first buy.
    /// @param salt From `mineSalt`.
    /// @return token The deployed token.
    /// @return poolId The Uniswap v4 pool, for every later fee call.
    function launch(
        TokenParams calldata params,
        uint256 configId,
        uint256 firstBuyIn,
        uint256 firstBuyMinOut,
        bytes32 salt
    ) external payable returns (address token, bytes32 poolId);

    /// @notice Launches a token whose fee stream is split between addresses.
    /// @dev Deploys a splitter clone and points the stream at it, except with a
    ///      single recipient at 10000 bps, which just names that address
    ///      directly and deploys nothing. `shares` must sum to exactly 10000,
    ///      and no recipient may be a protocol address — the factory, hook,
    ///      pool manager, quote, the token itself, or any module template.
    /// @param recipients Who receives the stream.
    /// @param shares Basis points each, summing to 10000.
    /// @return token The deployed token.
    /// @return poolId The Uniswap v4 pool.
    function launchWithFeeSplit(
        TokenParams calldata params,
        uint256 configId,
        uint256 firstBuyIn,
        uint256 firstBuyMinOut,
        bytes32 salt,
        address[] calldata recipients,
        uint16[] calldata shares
    ) external payable returns (address token, bytes32 poolId);

    /// @notice Finds a salt that produces a launchable token address.
    /// @dev A free `eth_call` — the node does the searching. A hit takes ~1000
    ///      tries on average against native ether and roughly twice that
    ///      against an ERC-20 quote, where candidates sorting below the quote
    ///      are discarded. Reverts `SaltNotFound` if the window is exhausted;
    ///      call again with `start` advanced past it.
    /// @param params The same params you will launch with.
    /// @param configId The same config id.
    /// @param sender The address that will send the launch transaction. The
    ///        address is CREATE2-derived from this, so mining for the wrong
    ///        sender yields a salt that reverts.
    /// @param start First salt to try.
    /// @param rounds How many to try. A few thousand is normal.
    /// @return salt Pass this to `launch`.
    /// @return token The address it will deploy to.
    function mineSalt(
        TokenParams calldata params,
        uint256 configId,
        address sender,
        uint256 start,
        uint256 rounds
    ) external view returns (bytes32 salt, address token);

    /// @notice Reads one row of the launch menu.
    /// @dev Read the menu rather than hardcoding ids. Rows are added over time
    ///      and a hardcoded id goes stale.
    function getLaunchConfig(uint256 configId) external view returns (LaunchConfig memory);

    /// @notice The lowest config id in use. The menu runs from here.
    function FIRST_CONFIG_ID() external view returns (uint256);

    /// @notice One past the highest config id. Iterate `[FIRST_CONFIG_ID, configCount)`.
    function configCount() external view returns (uint256);

    /// @notice Flat fee in wei that every launch must send as value.
    function launchFee() external view returns (uint256);

    /// @notice False when launching is paused globally.
    function launchEnabled() external view returns (bool);

    /// @notice The splitter deployed for a pool, or zero if the stream is not split.
    function launchSplitterOf(bytes32 poolId) external view returns (address);
}
