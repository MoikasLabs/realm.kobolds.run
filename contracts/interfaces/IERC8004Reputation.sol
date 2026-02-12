// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title IERC8004Reputation
 * @notice Interface for ERC-8004 Reputation Registry
 * @dev Stores feedback signals with flexible tagging
 */
interface IERC8004Reputation {
    // ============ Events ============
    
    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );
    
    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 indexed feedbackIndex
    );
    
    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 indexed feedbackIndex,
        address responder,
        string responseURI,
        bytes32 responseHash
    );

    // ============ Initialization ============
    
    /**
     * @notice Initialize the registry with identity registry address
     * @param identityRegistry_ The address of the Identity Registry
     */
    function initialize(address identityRegistry_) external;
    
    /**
     * @notice Get the identity registry address
     * @return identityRegistry The registry address
     */
    function getIdentityRegistry() external view returns (address);

    // ============ Feedback ============
    
    /**
     * @notice Submit feedback about an agent
     * @param agentId The agent being rated
     * @param value The rating value (can be negative)
     * @param valueDecimals Decimal places (0-18)
     * @param tag1 Primary category tag
     * @param tag2 Secondary subcategory tag
     * @param endpoint URI where interaction happened
     * @param feedbackURI Optional URI with detailed feedback
     * @param feedbackHash Hash of the feedback content
     */
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;
    
    /**
     * @notice Revoke previously submitted feedback
     * @param agentId The agent ID
     * @param feedbackIndex The index of feedback to revoke
     */
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;
    
    /**
     * @notice Append a response to feedback
     * @param agentId The agent ID
     * @param clientAddress Original feedback submitter
     * @param feedbackIndex Index of the feedback
     * @param responseURI URI with response content
     * @param responseHash Hash of the response
     */
    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external;

    // ============ Read Functions ============
    
    /**
     * @notice Get aggregated feedback summary
     * @param agentId The agent ID
     * @param clientAddresses Filter by specific clients (empty for all)
     * @param tag1 Filter by primary tag (empty for all)
     * @param tag2 Filter by secondary tag (empty for all)
     * @return count Number of feedback entries
     * @return summaryValue Sum of values
     * @return summaryValueDecimals Decimal places
     */
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);
    
    /**
     * @notice Read specific feedback entry
     * @param agentId The agent ID
     * @param clientAddress Client who submitted feedback
     * @param feedbackIndex Index in client's feedback list
     * @return value Rating value
     * @return valueDecimals Decimal places
     * @return tag1 Primary tag
     * @return tag2 Secondary tag
     * @return isRevoked Whether feedback was revoked
     */
    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view returns (
        int128 value,
        uint8 valueDecimals,
        string memory tag1,
        string memory tag2,
        bool isRevoked
    );
    
    /**
     * @notice Read all feedback with optional filters
     * @param agentId The agent ID
     * @param clientAddresses Filter by clients
     * @param tag1 Filter by primary tag
     * @param tag2 Filter by secondary tag
     * @param includeRevoked Include revoked feedback
     * @return clients Array of client addresses
     * @return feedbackIndexes Array of indices
     * @return values Array of values
     * @return valueDecimals Array of decimals
     * @return tag1s Array of primary tags
     * @return tag2s Array of secondary tags
     * @return revokedStatuses Array of revocation status
     */
    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    ) external view returns (
        address[] memory clients,
        uint64[] memory feedbackIndexes,
        int128[] memory values,
        uint8[] memory valueDecimals,
        string[] memory tag1s,
        string[] memory tag2s,
        bool[] memory revokedStatuses
    );
    
    /**
     * @notice Get number of clients who gave feedback
     * @param agentId The agent ID
     * @return count Number of unique clients
     */
    function getClients(uint256 agentId) external view returns (address[] memory);
    
    /**
     * @notice Get last feedback index for a client
     * @param agentId The agent ID
     * @param clientAddress The client address
     * @return index Last feedback index (0 if none)
     */
    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64);
    
    /**
     * @notice Get number of responses to feedback
     * @param agentId The agent ID
     * @param clientAddress Original feedback submitter
     * @param feedbackIndex Feedback index
     * @param responders Filter by responders
     * @return count Number of responses
     */
    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address[] calldata responders
    ) external view returns (uint64);
}