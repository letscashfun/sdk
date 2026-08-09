// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ILaunchSplitter
/// @notice A per-launch fee splitter, from a recipient's side.
///
/// @dev Deployed as a clone by `launchWithFeeSplit` when a launch names more
///      than one recipient. Find it with `ILetscashFactory.launchSplitterOf`.
///
///      Both writes belong to the recipient alone. Whoever launched the coin
///      cannot redirect a share they promised away, and cannot claw one back.
///
///      Every selector below is checked against the generated ABI in this
///      package's test suite, so this file cannot drift from the deployment.
interface ILaunchSplitter {
    /// @notice What an address has been allocated and not yet withdrawn.
    /// @dev Only counts revenue that has been through `distribute`. Money that
    ///      has arrived but not been distributed shows in `unallocated`, not
    ///      here. Call `distribute` first for the true figure.
    /// @param who The recipient.
    /// @return Owed, in the pool's quote asset.
    function owed(address who) external view returns (uint256);

    /// @notice Splits everything that has arrived since the last call across
    ///         the recipients, according to their shares.
    /// @dev Permissionless and unnecessary in normal operation — the collect
    ///      functions distribute first. Worth calling directly only when you
    ///      want `owed` to read true without moving money.
    function distribute() external;

    /// @notice Pays the caller their allocated balance.
    /// @return Paid out, in the pool's quote asset.
    function collect() external returns (uint256);

    /// @notice Pays the caller's allocated balance to an address they name.
    /// @dev Does not change who holds the slot; use `rotate` for that.
    /// @param to Where the funds land.
    /// @return Paid out, in the pool's quote asset.
    function collect(address to) external returns (uint256);

    /// @notice Pays part of the caller's allocated balance.
    /// @param to Where the funds land.
    /// @param amount How much to take.
    /// @return Paid out, in the pool's quote asset.
    function collect(address to, uint256 amount) external returns (uint256);

    /// @notice Hands the caller's slot to another address, permanently.
    /// @dev Moves the future percentage AND the balance already allocated to
    ///      it. The destination must not already hold a slot in the same
    ///      splitter. Irreversible.
    /// @param to The new holder of the slot.
    function rotate(address to) external;

    /// @notice Which slot an address holds, if any.
    /// @param who The address to look up.
    /// @return slot Index into the recipient list. Meaningless when
    ///         `isRecipient` is false — check the flag, not the index, because
    ///         slot zero is a real slot.
    /// @return isRecipient Whether the address holds a slot at all.
    function slotOf(address who) external view returns (uint256 slot, bool isRecipient);

    /// @notice The full recipient list and their shares in basis points.
    /// @return recipients Addresses, in slot order.
    /// @return shares Basis points each, summing to 10000.
    function split() external view returns (address[] memory recipients, uint16[] memory shares);

    /// @notice Revenue that has arrived but not yet been distributed.
    function unallocated() external view returns (uint256);

    /// @notice The pool whose fee stream feeds this splitter.
    function poolId() external view returns (bytes32);

    /// @notice What this splitter pays out in. Zero means native ether.
    function quote() external view returns (address);
}
