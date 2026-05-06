// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MantleSignalRegistry
 * @notice On-chain registry of AI-generated trading signals — provides verifiable alpha track record
 * @dev Deployed on Mantle Network. Signals written by the MantleSignal agent, readable by anyone.
 */
contract MantleSignalRegistry {

    struct Signal {
        uint256 id;
        address trackedWallet;   // smart money wallet that triggered the signal
        string  signalType;      // "BUY" | "SELL" | "HOLD"
        uint8   confidence;      // 0-100 (AI confidence score)
        string  asset;           // e.g. "MNT/USDC"
        uint256 entryPrice;      // scaled by 1e8
        uint256 timestamp;
        bool    executed;        // true once Byreal has filled the order
        int256  pnlBps;          // realised P&L in basis points (set on close)
        string  analysisUri;     // ipfs:// or arweave:// URI with full Claude reasoning
    }

    Signal[]  private _signals;
    address   public  owner;
    address   public  agentAddress;

    // ── Stats ─────────────────────────────────────────────────────────────────
    uint256 public totalSignals;
    uint256 public executedSignals;
    int256  public cumulativePnlBps;

    // ── Events ────────────────────────────────────────────────────────────────
    event SignalRecorded(
        uint256 indexed id,
        address indexed trackedWallet,
        string  signalType,
        uint8   confidence,
        string  asset
    );
    event SignalExecuted(uint256 indexed id, int256 pnlBps);
    event AgentUpdated(address indexed newAgent);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyAgent() {
        require(msg.sender == agentAddress || msg.sender == owner, "MantleSignal: unauthorized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "MantleSignal: not owner");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _agentAddress) {
        owner        = msg.sender;
        agentAddress = _agentAddress;
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * @notice Record a new AI-generated signal on-chain
     * @return id The signal ID (index into storage array)
     */
    function recordSignal(
        address _wallet,
        string  calldata _type,
        uint8   _confidence,
        string  calldata _asset,
        uint256 _entryPrice,
        string  calldata _analysisUri
    ) external onlyAgent returns (uint256 id) {
        require(_confidence <= 100, "MantleSignal: confidence out of range");
        require(bytes(_type).length > 0,  "MantleSignal: empty type");
        require(bytes(_asset).length > 0, "MantleSignal: empty asset");

        id = _signals.length;
        _signals.push(Signal({
            id:          id,
            trackedWallet: _wallet,
            signalType:  _type,
            confidence:  _confidence,
            asset:       _asset,
            entryPrice:  _entryPrice,
            timestamp:   block.timestamp,
            executed:    false,
            pnlBps:      0,
            analysisUri: _analysisUri
        }));

        totalSignals++;
        emit SignalRecorded(id, _wallet, _type, _confidence, _asset);
    }

    /**
     * @notice Mark a signal as executed and record its realised P&L
     */
    function closeSignal(uint256 _id, int256 _pnlBps) external onlyAgent {
        require(_id < _signals.length,  "MantleSignal: not found");
        require(!_signals[_id].executed, "MantleSignal: already closed");

        _signals[_id].executed = true;
        _signals[_id].pnlBps   = _pnlBps;

        executedSignals++;
        cumulativePnlBps += _pnlBps;

        emit SignalExecuted(_id, _pnlBps);
    }

    /**
     * @notice Update the authorized agent address
     */
    function setAgent(address _newAgent) external onlyOwner {
        agentAddress = _newAgent;
        emit AgentUpdated(_newAgent);
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    function getSignal(uint256 _id) external view returns (Signal memory) {
        require(_id < _signals.length, "MantleSignal: not found");
        return _signals[_id];
    }

    function getSignalCount() external view returns (uint256) {
        return _signals.length;
    }

    /**
     * @notice Returns the N most recent signals (newest first)
     */
    function getRecentSignals(uint256 _n) external view returns (Signal[] memory) {
        uint256 len   = _signals.length;
        uint256 count = _n > len ? len : _n;
        Signal[] memory result = new Signal[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = _signals[len - 1 - i];
        }
        return result;
    }

    /**
     * @notice Returns all signals for a given wallet
     */
    function getSignalsByWallet(address _wallet) external view returns (Signal[] memory) {
        uint256 count;
        for (uint256 i = 0; i < _signals.length; i++) {
            if (_signals[i].trackedWallet == _wallet) count++;
        }
        Signal[] memory result = new Signal[](count);
        uint256 j;
        for (uint256 i = 0; i < _signals.length; i++) {
            if (_signals[i].trackedWallet == _wallet) result[j++] = _signals[i];
        }
        return result;
    }

    /**
     * @notice Returns aggregate stats — useful for dashboard
     */
    function getStats() external view returns (
        uint256 total,
        uint256 executed,
        int256  cumPnlBps,
        uint256 winRate     // bps (e.g. 6500 = 65%)
    ) {
        total      = totalSignals;
        executed   = executedSignals;
        cumPnlBps  = cumulativePnlBps;

        if (executedSignals == 0) return (total, executed, cumPnlBps, 0);

        uint256 wins;
        for (uint256 i = 0; i < _signals.length; i++) {
            if (_signals[i].executed && _signals[i].pnlBps > 0) wins++;
        }
        winRate = (wins * 10_000) / executedSignals;
    }
}
