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
    event RepositoryDeactivated(uint256 indexed id);
    
    constructor(address initialOwner) Ownable(initialOwner) {
        repoCounter = 0;
    }
    
    /**
     * @dev Deactivates a repository by setting isActive to false
     * @param id The ID of the repository to deactivate
     * @notice Only the repository maintainer or contract owner can deactivate a repository
     */
    function deactivateRepository(uint256 id) external nonReentrant {
        Repository storage repo = repositories[id];
        require(repo.maintainer != address(0), "Repository does not exist");
        require(repo.maintainer == msg.sender || owner() == msg.sender, "No rights");
        require(repo.isActive, "Repository already inactive");
        
        repo.isActive = false;
        emit RepositoryDeactivated(id);
    }
}
