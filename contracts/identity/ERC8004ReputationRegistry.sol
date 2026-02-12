// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../interfaces/IERC8004Reputation.sol";
import "../interfaces/IERC8004Identity.sol";

/**
 * @title ERC8004ReputationRegistry
 * @notice ERC-8004 Reputation Registry implementation
 * @dev Stores feedback signals with flexible tagging, uses UUPS proxy pattern
 */
contract ERC8004ReputationRegistry is 
    Initializable, 
    UUPSUpgradeable,
    OwnableUpgradeable,
    IERC8004Reputation 
{
    using EnumerableSet for EnumerableSet.AddressSet;

    // ============ Structs ============
    
    struct FeedbackEntry {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        string endpoint;
        string feedbackURI;
        bytes32 feedbackHash;
        bool isRevoked;
    }
    
    struct ResponseEntry {
        address responder;
        string responseURI;
        bytes32 responseHash;
    }

    // ============ State Variables ============
    
    /// @notice Reference to the Identity Registry
    IERC8004Identity public identityRegistry;
    
    /// @notice Mapping: agentId => clientAddress => feedbackIndex => FeedbackEntry
    mapping(uint256 => mapping(address => mapping(uint64 => FeedbackEntry))) private _feedback;
    
    /// @notice Mapping: agentId => clientAddress => lastIndex
    mapping(uint256 => mapping(address => uint64)) private _lastFeedbackIndex;
    
    /// @notice Mapping: agentId => set of client addresses
    mapping(uint256 => EnumerableSet.AddressSet) private _clients;
    
    /// @notice Mapping: agentId => clientAddress => feedbackIndex => responses
    mapping(uint256 => mapping(address => mapping(uint64 => ResponseEntry[]))) private _responses;
    
    /// @notice Mapping of valid tag1 values (configurable by owner)
    mapping(string => bool) public validTag1;
    
    /// @notice Array of valid tag1 values for enumeration
    string[] private _validTag1List;

    // ============ Events ============
    
    /// @notice Emitted when a new valid tag is added
    event TagAdded(string indexed tag);
    
    /// @notice Emitted when a tag is removed
    event TagRemoved(string indexed tag);

    // ============ Errors ============
    
    error InvalidTag(string tag);
    error AgentNotRegistered(uint256 agentId);
    error FeedbackNotFound();
    error NotFeedbackAuthor();
    error InvalidValue();
    error InvalidDecimals();
    error UnauthorizedResponder();

    // ============ Initializer ============
    
    /// @inheritdoc IERC8004Reputation
    function initialize(address identityRegistry_) 
        external 
        initializer 
    {
        __Ownable_init(msg.sender);
        identityRegistry = IERC8004Identity(identityRegistry_);
        
        // Initialize default tags
        _addTag("quality");
        _addTag("reliability");
        _addTag("speed");
        _addTag("cost");
        _addTag("communication");
    }
    
    // ============ Tag Management ============
    
    /**
     * @notice Add a valid tag1 value
     * @param tag The tag to add
     */
    function addTag(string calldata tag) external onlyOwner {
        _addTag(tag);
    }
    
    /**
     * @notice Remove a valid tag1 value
     * @param tag The tag to remove
     */
    function removeTag(string calldata tag) external onlyOwner {
        require(validTag1[tag], "Tag not found");
        validTag1[tag] = false;
        emit TagRemoved(tag);
    }
    
    function _addTag(string memory tag) internal {
        require(!validTag1[tag], "Tag already exists");
        validTag1[tag] = true;
        _validTag1List.push(tag);
        emit TagAdded(tag);
    }
    
    /**
     * @notice Get all valid tag1 values
     * @return tags Array of valid tags
     */
    function getValidTags() external view returns (string[] memory) {
        return _validTag1List;
    }

    // ============ Feedback Functions ============
    
    /// @inheritdoc IERC8004Reputation
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external override {
        // Verify agent exists
        try identityRegistry.ownerOf(agentId) returns (address) {
            // Agent exists
        } catch {
            revert AgentNotRegistered(agentId);
        }
        
        // Validate decimals (max 18)
        if (valueDecimals > 18) revert InvalidDecimals();
        
        // Validate tag1 (optional - can be empty or must be valid)
        if (bytes(tag1).length > 0 && !validTag1[tag1]) {
            revert InvalidTag(tag1);
        }
        
        // Get next feedback index
        uint64 feedbackIndex = _lastFeedbackIndex[agentId][msg.sender] + 1;
        _lastFeedbackIndex[agentId][msg.sender] = feedbackIndex;
        
        // Add client to set
        _clients[agentId].add(msg.sender);
        
        // Store feedback
        _feedback[agentId][msg.sender][feedbackIndex] = FeedbackEntry({
            value: value,
            valueDecimals: valueDecimals,
            tag1: tag1,
            tag2: tag2,
            endpoint: endpoint,
            feedbackURI: feedbackURI,
            feedbackHash: feedbackHash,
            isRevoked: false
        });
        
        emit NewFeedback(
            agentId,
            msg.sender,
            feedbackIndex,
            value,
            valueDecimals,
            tag1,
            tag1,
            tag2,
            endpoint,
            feedbackURI,
            feedbackHash
        );
    }
    
    /// @inheritdoc IERC8004Reputation
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external override {
        FeedbackEntry storage entry = _feedback[agentId][msg.sender][feedbackIndex];
        
        if (entry.feedbackHash == bytes32(0)) revert FeedbackNotFound();
        if (entry.isRevoked) revert FeedbackNotFound();
        
        entry.isRevoked = true;
        
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }
    
    /// @inheritdoc IERC8004Reputation
    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external override {
        FeedbackEntry storage entry = _feedback[agentId][clientAddress][feedbackIndex];
        
        if (entry.feedbackHash == bytes32(0)) revert FeedbackNotFound();
        
        // Only the agent owner or approved can respond
        address agentOwner = identityRegistry.ownerOf(agentId);
        bool isAuthorized = (msg.sender == agentOwner || 
            identityRegistry.getApproved(agentId) == msg.sender ||
            identityRegistry.isApprovedForAll(agentOwner, msg.sender));
            
        if (!isAuthorized) revert UnauthorizedResponder();
        
        _responses[agentId][clientAddress][feedbackIndex].push(ResponseEntry({
            responder: msg.sender,
            responseURI: responseURI,
            responseHash: responseHash
        }));
        
        emit ResponseAppended(
            agentId,
            clientAddress,
            feedbackIndex,
            msg.sender,
            responseURI,
            responseHash
        );
    }

    // ============ Read Functions ============
    
    /// @inheritdoc IERC8004Reputation
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view override returns (
        uint64 count,
        int128 summaryValue,
        uint8 summaryValueDecimals
    ) {
        // Get clients to iterate
        address[] memory clients = clientAddresses.length > 0 
            ? clientAddresses 
            : _clients[agentId].values();
        
        uint8 targetDecimals = 18; // Normalize to 18 decimals
        
        for (uint256 i = 0; i < clients.length; i++) {
            uint64 lastIdx = _lastFeedbackIndex[agentId][clients[i]];
            
            for (uint64 j = 1; j <= lastIdx; j++) {
                FeedbackEntry storage entry = _feedback[agentId][clients[i]][j];
                
                if (entry.isRevoked) continue;
                
                // Filter by tags
                if (bytes(tag1).length > 0 && 
                    keccak256(bytes(entry.tag1)) != keccak256(bytes(tag1))) continue;
                if (bytes(tag2).length > 0 && 
                    keccak256(bytes(entry.tag2)) != keccak256(bytes(tag2))) continue;
                
                count++;
                
                // Normalize value to 18 decimals and add to summary
                uint8 scaleFactor = targetDecimals - entry.valueDecimals;
                int128 multiplier = int128(int256(10 ** uint256(scaleFactor)));
                int128 normalizedValue = entry.value * multiplier;
                summaryValue += normalizedValue;
            }
        }
        
        summaryValueDecimals = targetDecimals;
    }
    
    /// @inheritdoc IERC8004Reputation
    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view override returns (
        int128 value,
        uint8 valueDecimals,
        string memory tag1,
        string memory tag2,
        bool isRevoked
    ) {
        FeedbackEntry storage entry = _feedback[agentId][clientAddress][feedbackIndex];
        
        if (entry.feedbackHash == bytes32(0)) revert FeedbackNotFound();
        
        return (
            entry.value,
            entry.valueDecimals,
            entry.tag1,
            entry.tag2,
            entry.isRevoked
        );
    }
    
    /// @inheritdoc IERC8004Reputation
    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    ) external view override returns (
        address[] memory clients,
        uint64[] memory feedbackIndexes,
        int128[] memory values,
        uint8[] memory valueDecimals,
        string[] memory tag1s,
        string[] memory tag2s,
        bool[] memory revokedStatuses
    ) {
        // First pass: count entries
        address[] memory allClients = clientAddresses.length > 0 
            ? clientAddresses 
            : _clients[agentId].values();
        
        uint256 totalEntries = 0;
        for (uint256 i = 0; i < allClients.length; i++) {
            uint64 lastIdx = _lastFeedbackIndex[agentId][allClients[i]];
            for (uint64 j = 1; j <= lastIdx; j++) {
                FeedbackEntry storage entry = _feedback[agentId][allClients[i]][j];
                
                if (!includeRevoked && entry.isRevoked) continue;
                
                // Filter by tags
                if (bytes(tag1).length > 0 && 
                    keccak256(bytes(entry.tag1)) != keccak256(bytes(tag1))) continue;
                if (bytes(tag2).length > 0 && 
                    keccak256(bytes(entry.tag2)) != keccak256(bytes(tag2))) continue;
                
                totalEntries++;
            }
        }
        
        // Allocate arrays
        clients = new address[](totalEntries);
        feedbackIndexes = new uint64[](totalEntries);
        values = new int128[](totalEntries);
        valueDecimals = new uint8[](totalEntries);
        tag1s = new string[](totalEntries);
        tag2s = new string[](totalEntries);
        revokedStatuses = new bool[](totalEntries);
        
        // Second pass: fill arrays
        uint256 idx = 0;
        for (uint256 i = 0; i < allClients.length; i++) {
            uint64 lastIdx = _lastFeedbackIndex[agentId][allClients[i]];
            for (uint64 j = 1; j <= lastIdx; j++) {
                FeedbackEntry storage entry = _feedback[agentId][allClients[i]][j];
                
                if (!includeRevoked && entry.isRevoked) continue;
                
                // Filter by tags
                if (bytes(tag1).length > 0 && 
                    keccak256(bytes(entry.tag1)) != keccak256(bytes(tag1))) continue;
                if (bytes(tag2).length > 0 && 
                    keccak256(bytes(entry.tag2)) != keccak256(bytes(tag2))) continue;
                
                clients[idx] = allClients[i];
                feedbackIndexes[idx] = j;
                values[idx] = entry.value;
                valueDecimals[idx] = entry.valueDecimals;
                tag1s[idx] = entry.tag1;
                tag2s[idx] = entry.tag2;
                revokedStatuses[idx] = entry.isRevoked;
                
                idx++;
            }
        }
    }
    
    /// @inheritdoc IERC8004Reputation
    function getClients(uint256 agentId) external view override returns (address[] memory) {
        return _clients[agentId].values();
    }
    
    /// @inheritdoc IERC8004Reputation
    function getLastIndex(uint256 agentId, address clientAddress) external view override returns (uint64) {
        return _lastFeedbackIndex[agentId][clientAddress];
    }
    
    /// @inheritdoc IERC8004Reputation
    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address[] calldata /* responders */
    ) external view override returns (uint64) {
        return uint64(_responses[agentId][clientAddress][feedbackIndex].length);
    }
    
    /**
     * @notice Get responses for a specific feedback
     * @param agentId The agent ID
     * @param clientAddress Original feedback submitter
     * @param feedbackIndex Feedback index
     * @return responders Array of responder addresses
     * @return responseURIs Array of response URIs
     * @return responseHashes Array of response hashes
     */
    function getResponses(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view returns (
        address[] memory responders,
        string[] memory responseURIs,
        bytes32[] memory responseHashes
    ) {
        ResponseEntry[] storage entries = _responses[agentId][clientAddress][feedbackIndex];
        
        responders = new address[](entries.length);
        responseURIs = new string[](entries.length);
        responseHashes = new bytes32[](entries.length);
        
        for (uint256 i = 0; i < entries.length; i++) {
            responders[i] = entries[i].responder;
            responseURIs[i] = entries[i].responseURI;
            responseHashes[i] = entries[i].responseHash;
        }
    }

    // ============ View Functions ============
    
    /// @inheritdoc IERC8004Reputation
    function getIdentityRegistry() external view override returns (address) {
        return address(identityRegistry);
    }
    
    // ============ UUPS Upgrade Authorization ============
    
    /**
     * @notice Authorize an upgrade (only owner can upgrade)
     * @dev Required by UUPSUpgradeable
     */
    function _authorizeUpgrade(address) internal override onlyOwner {}
}