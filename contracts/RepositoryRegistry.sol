// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RepositoryRegistry is Ownable, ReentrancyGuard {
    
    struct Repository {
        string name;
        string description;
        string githubUrl;
        address maintainer;
        uint256 totalVotes;
        bool isActive;
        uint256 submissionTime;
        string[] tags;
    }
    
    mapping(uint256 => Repository) private repositories;
    uint256 private repoCounter;
    
    // Event placeholders
    event RepositorySubmitted(uint256 indexed id, address indexed maintainer);
    event RepositoryUpdated(uint256 indexed id, address indexed maintainer);
    
    constructor(address initialOwner) Ownable(initialOwner) {
        repoCounter = 0;
    }
    
    /**
     * @dev Submit a new repository to the registry
     * @param name Repository name (must not be empty)
     * @param description Repository description
     * @param url GitHub URL (must not be empty)
     * @param tags Array of tags (must have at least one tag)
     */
    function submitRepository(
        string calldata name,
        string calldata description,
        string calldata url,
        string[] calldata tags
    ) external nonReentrant {
        // Validate input parameters
        require(bytes(name).length > 0, "Repository name cannot be empty");
        require(bytes(url).length > 0, "Repository URL cannot be empty");
        require(tags.length > 0, "Tags are required");
        
        // Increment counter and create new repository
        repoCounter += 1;
        
        // Store repository in mapping
        repositories[repoCounter] = Repository({
            name: name,
            description: description,
            githubUrl: url,
            maintainer: msg.sender,
            totalVotes: 0,
            isActive: true,
            submissionTime: block.timestamp,
            tags: tags
        });
        
        // Emit event
        emit RepositorySubmitted(repoCounter, msg.sender);
    }
}
