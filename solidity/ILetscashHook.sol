// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ILetscashHook
/// @notice The letscash fee stream, from an integrating contract's side.
///
/// @dev Curated deliberately. The deployed hook also implements forty Uniswap
///      v4 callbacks that only the PoolManager may call; none of them are here
///      because calling one yourself reverts. If you need the exhaustive
///      surface, use `abis/hook.json`.
///
///      Every selector below is checked against the generated ABI in this
///      package's test suite, so this file cannot drift from the deployment.
interface ILetscashHook {
    /// @notice Pays the caller everything the pool owes them.
    /// @dev Only the pool's current creator may call. Sweeps internally first,
    ///      so there is no need to call `sweep` beforehand — one call is
    ///      enough, and `tab + pending` is what you will receive.
    /// @param poolId The pool, as returned by `launch` or derived from the key.
    /// @return amount Paid out, in the pool's quote asset.
    function claim(bytes32 poolId) external returns (uint256 amount);

    /// @notice Pays everything the pool owes to an address you name.
    /// @dev Still callable only by the creator; this chooses the destination,
    ///      not who is permitted to move the money. Use this when your contract
    ///      can make the call but cannot receive the asset — a contract with no
    ///      `receive()` on an ether-quoted pool, for instance.
    /// @param poolId The pool.
    /// @param to Where the funds land.
    /// @return amount Paid out, in the pool's quote asset.
    function claim(bytes32 poolId, address to) external returns (uint256 amount);

    /// @notice Pays part of what is owed.
    /// @dev Exists so a balance can be drawn down in pieces if a quote token
    ///      ever refuses a transfer above some size. Reverts with
    ///      `AmountNotOwed` if `amount` exceeds the balance.
    /// @param poolId The pool.
    /// @param to Where the funds land.
    /// @param amount How much to take.
    /// @return Paid out, in the pool's quote asset.
    function claim(bytes32 poolId, address to, uint256 amount) external returns (uint256);

    /// @notice Moves accrued fees out of the pool manager and books them.
    /// @dev Permissionless, and unnecessary before `claim`, which sweeps for
    ///      you. Useful only if you want the accounting settled without taking
    ///      the money — to read an exact `tab`, say.
    /// @param poolId The pool.
    /// @return creatorAmount Booked to the creator.
    /// @return platformAmount Booked to the platform.
    function sweep(bytes32 poolId) external returns (uint256 creatorAmount, uint256 platformAmount);

    /// @notice Hands the whole fee stream to someone else, permanently.
    /// @dev Callable only by the current creator, effective immediately, and
    ///      irreversible: afterwards only `newCreator` can move it, including
    ///      any balance already accrued but unclaimed. Claim first if you want
    ///      to keep what has built up.
    /// @param poolId The pool.
    /// @param newCreator The new owner of the stream.
    function updateCreator(bytes32 poolId, address newCreator) external;

    /// @notice Fees already swept and waiting to be claimed.
    /// @param poolId The pool.
    /// @return Owed to the creator, in the pool's quote asset.
    function tab(bytes32 poolId) external view returns (uint256);

    /// @notice Fees accrued in the pool manager but not yet swept.
    /// @dev What you receive from `claim` is `tab + pending`, because claiming
    ///      sweeps first. Reading only `tab` under-reports.
    /// @param poolId The pool.
    /// @return Unswept, in the pool's quote asset.
    function pending(bytes32 poolId) external view returns (uint256);

    /// @notice The pool's fee configuration.
    /// @param poolId The pool.
    /// @return creator Who currently owns the fee stream.
    /// @return creatorFeeBps The creator's share of the fee, in basis points.
    /// @return feeRate The total fee, in hundredths of a basis point (1e6 = 100%).
    /// @return exists False for a pool this hook does not know about.
    /// @return quote What the pool is priced and paid in. Zero means native ether.
    function poolConfigs(bytes32 poolId)
        external
        view
        returns (address creator, uint16 creatorFeeBps, uint24 feeRate, bool exists, address quote);
}
