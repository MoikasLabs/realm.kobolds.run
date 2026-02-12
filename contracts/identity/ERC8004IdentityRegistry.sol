// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IERC8004Identity.sol";

/**
 * @title ERC8004IdentityRegistry
 * @notice ERC-8004 Identity Registry implementation
 * @dev ERC-721 NFT representing agent identities with metadata and wallet management
 */
contract ERC8004IdentityRegistry is 
    ERC721, 
    ERC721URIStorage, 
    Ownable, 
    EIP712,
    ReentrancyGuard,
    IERC8004Identity 
{
    using ECDSA for bytes32;

    // ============ State Variables ============
    
    uint256 private _nextTokenId;
    
    // Mapping from agentId to metadata key => value
    mapping(uint256 => mapping(string => bytes)) private _metadata;
    
    // Mapping from agentId to payment wallet
    mapping(uint256 => address) private _agentWallets;
    
    // Mapping from owner to list of agent IDs
    mapping(address => uint256[]) private _ownedAgents;
    
    // EIP-712 typehash for wallet setting
    bytes32 public constant WALLET_TYPEHASH = keccak256(
        "SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)"
    );
    
    // ============ Constructor ============
    
    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner
    ) ERC721(name_, symbol_) Ownable(initialOwner) EIP712("ERC8004Identity", "1") {
    }
    
    // ============ Registration Functions ============
    
    /// @inheritdoc IERC8004Identity
    function register(
        string calldata agentURI, 
        MetadataEntry[] calldata metadata
    ) external override nonReentrant returns (uint256 agentId) {
        agentId = _nextTokenId++;
        
        _safeMint(msg.sender, agentId);
        
        if (bytes(agentURI).length > 0) {
            _setTokenURI(agentId, agentURI);
        }
        
        // Store metadata
        for (uint256 i = 0; i < metadata.length; i++) {
            _metadata[agentId][metadata[i].metadataKey] = metadata[i].metadataValue;
        }
        
        // Track owned agents
        _ownedAgents[msg.sender].push(agentId);
        
        emit Registered(agentId, agentURI, msg.sender);
        
        // Emit metadata events
        for (uint256 i = 0; i < metadata.length; i++) {
            emit MetadataSet(
                agentId, 
                metadata[i].metadataKey, 
                metadata[i].metadataKey, 
                metadata[i].metadataValue
            );
        }
    }
    
    /// @inheritdoc IERC8004Identity
    function register(string calldata agentURI) external override returns (uint256 agentId) {
        agentId = _nextTokenId++;
        
        _safeMint(msg.sender, agentId);
        
        if (bytes(agentURI).length > 0) {
            _setTokenURI(agentId, agentURI);
        }
        
        _ownedAgents[msg.sender].push(agentId);
        
        emit Registered(agentId, agentURI, msg.sender);
    }
    
    /// @inheritdoc IERC8004Identity
    function register() external override returns (uint256 agentId) {
        agentId = _nextTokenId++;
        
        _safeMint(msg.sender, agentId);
        
        _ownedAgents[msg.sender].push(agentId);
        
        emit Registered(agentId, "", msg.sender);
    }
    
    // ============ Metadata Management ============
    
    /// @inheritdoc IERC8004Identity
    function getMetadata(
        uint256 agentId, 
        string memory metadataKey
    ) external view override returns (bytes memory) {
        _requireOwned(agentId);
        return _metadata[agentId][metadataKey];
    }
    
    /// @inheritdoc IERC8004Identity
    function setMetadata(
        uint256 agentId, 
        string memory metadataKey, 
        bytes memory metadataValue
    ) external override {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "Not authorized");
        
        _metadata[agentId][metadataKey] = metadataValue;
        
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }
    
    /// @inheritdoc IERC8004Identity
    function setAgentURI(uint256 agentId, string calldata newURI) external override {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "Not authorized");
        
        _setTokenURI(agentId, newURI);
        
        emit URIUpdated(agentId, newURI, msg.sender);
    }
    
    // ============ Wallet Management ============
    
    /// @inheritdoc IERC8004Identity
    function setAgentWallet(
        uint256 agentId, 
        address newWallet, 
        uint256 deadline, 
        bytes calldata signature
    ) external override {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "Not authorized");
        require(block.timestamp <= deadline, "Signature expired");
        require(newWallet != address(0), "Invalid wallet address");
        
        // Verify EIP-712 signature from the new wallet
        bytes32 structHash = keccak256(abi.encode(
            WALLET_TYPEHASH,
            agentId,
            newWallet,
            deadline
        ));
        
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        
        require(signer == newWallet, "Invalid signature");
        
        _agentWallets[agentId] = newWallet;
        
        emit AgentWalletSet(agentId, newWallet, deadline);
    }
    
    /// @inheritdoc IERC8004Identity
    function getAgentWallet(uint256 agentId) external view override returns (address) {
        _requireOwned(agentId);
        return _agentWallets[agentId];
    }
    
    /// @inheritdoc IERC8004Identity
    function unsetAgentWallet(uint256 agentId) external override {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "Not authorized");
        
        delete _agentWallets[agentId];
        
        emit AgentWalletUnset(agentId);
    }
    
    // ============ View Functions ============
    
    /// @inheritdoc IERC8004Identity
    function totalAgents() external view override returns (uint256) {
        return _nextTokenId;
    }
    
    /// @inheritdoc IERC8004Identity
    function agentsOf(address owner) external view override returns (uint256[] memory) {
        return _ownedAgents[owner];
    }
    
    // ============ ERC-721 Overrides ============
    
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Update owned agents tracking
        if (from != address(0) && to != address(0)) {
            // Remove from previous owner
            uint256[] storage fromAgents = _ownedAgents[from];
            for (uint256 i = 0; i < fromAgents.length; i++) {
                if (fromAgents[i] == tokenId) {
                    fromAgents[i] = fromAgents[fromAgents.length - 1];
                    fromAgents.pop();
                    break;
                }
            }
            
            // Add to new owner
            _ownedAgents[to].push(tokenId);
        }
        
        return super._update(to, tokenId, auth);
    }
    
    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721URIStorage, IERC165) returns (bool) {
        return 
            interfaceId == type(IERC8004Identity).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}