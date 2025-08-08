// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IDEVoterEscrow
 * @dev Interface for the DEVoterEscrow contract
 */
interface IDEVoterEscrow {
    function hasActiveEscrow(address user) external view returns (bool);
    function getUserEscrowAmount(address user) external view returns (uint256);
    function castVote(uint256 repositoryId, uint256 amount) external;
}

/**
 * @title IRepositoryRegistry
 * @dev Interface for the RepositoryRegistry contract
 */
interface IRepositoryRegistry {
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
    
    function getRepositoryDetails(uint256 id) external view returns (Repository memory);
    function isRepositoryActive(uint256 id) external view returns (bool);
}

/**
 * @title DEVoterVoting
 * @dev Main voting contract that interfaces with DEVoterEscrow and RepositoryRegistry
 */
contract DEVoterVoting is Ownable, ReentrancyGuard {
    IDEVoterEscrow public escrowContract;
    IRepositoryRegistry public registryContract;
    
    /**
     * @dev Constructor to initialize the voting contract
     * @param _escrow Address of the DEVoterEscrow contract
     * @param _registry Address of the RepositoryRegistry contract
     * @param initialOwner Address of the initial owner
     */
    constructor(
        address _escrow, 
        address _registry,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_escrow != address(0), "Invalid escrow address");
        require(_registry != address(0), "Invalid registry address");
        
        escrowContract = IDEVoterEscrow(_escrow);
        registryContract = IRepositoryRegistry(_registry);
    }
}
