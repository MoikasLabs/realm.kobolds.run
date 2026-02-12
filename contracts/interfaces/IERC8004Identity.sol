// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title IERC8004Identity
 * @notice Interface for ERC-8004 Identity Registry
 * @dev Based on ERC-721 with URIStorage extension
 */
interface IERC8004Identity is IERC721 {
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    // ============ Events ============
    
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId, 
        string indexed indexedMetadataKey, 
        string metadataKey, 
        bytes metadataValue
    );
    event AgentWalletSet(uint256 indexed agentId, address wallet, uint256 deadline);
    event AgentWalletUnset(uint256 indexed agentId);

    // ============ Registration ============
    
    /**
     * @notice Register a new agent with metadata
     * @param agentURI URI pointing to agent registration file
     * @param metadata Array of metadata key-value pairs
     * @return agentId The newly minted agent ID
     */
    function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId);
    
    /**
     * @notice Register with just URI
     * @param agentURI URI pointing to agent registration file
     * @return agentId The newly minted agent ID
     */
    function register(string calldata agentURI) external returns (uint256 agentId);
    
    /**
     * @notice Register without URI (must be set later)
     * @return agentId The newly minted agent ID
     */
    function register() external returns (uint256 agentId);

    // ============ Metadata Management ============
    
    /**
     * @notice Get metadata for an agent
     * @param agentId The agent ID
     * @param metadataKey The metadata key
     * @return metadataValue The metadata value as bytes
     */
    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory);
    
    /**
     * @notice Set metadata for an agent (owner or approved only)
     * @param agentId The agent ID
     * @param metadataKey The metadata key
     * @param metadataValue The metadata value
     */
    function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external;
    
    /**
     * @notice Update the agent URI
     * @param agentId The agent ID
     * @param newURI The new URI
     */
    function setAgentURI(uint256 agentId, string calldata newURI) external;

    // ============ Wallet Management ============
    
    /**
     * @notice Set the agent's payment wallet with signature proof
     * @param agentId The agent ID
     * @param newWallet The new wallet address
     * @param deadline EIP-712 deadline
     * @param signature EIP-712 signature from new wallet
     */
    function setAgentWallet(
        uint256 agentId, 
        address newWallet, 
        uint256 deadline, 
        bytes calldata signature
    ) external;
    
    /**
     * @notice Get the agent's payment wallet
     * @param agentId The agent ID
     * @return wallet The wallet address (0x0 if not set)
     */
    function getAgentWallet(uint256 agentId) external view returns (address);
    
    /**
     * @notice Unset the agent's payment wallet
     * @param agentId The agent ID
     */
    function unsetAgentWallet(uint256 agentId) external;

    // ============ View Functions ============
    
    /**
     * @notice Get total number of registered agents
     * @return count Total count
     */
    function totalAgents() external view returns (uint256);
    
    /**
     * @notice Get all agent IDs owned by an address
     * @param owner The owner address
     * @return agentIds Array of agent IDs
     */
    function agentsOf(address owner) external view returns (uint256[] memory);
}