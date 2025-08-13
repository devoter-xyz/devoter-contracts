// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./DEVoterEscrow.sol";
import "./RepositoryRegistry.sol";

/**
 * @title DEVoterVoting
 * @dev Main voting contract that interfaces with DEVoterEscrow and RepositoryRegistry
 */
contract DEVoterVoting is Ownable, ReentrancyGuard {
    DEVoterEscrow public escrowContract;
    RepositoryRegistry public registryContract;
    
    // ===== VOTE TRACKING DATA STRUCTURES =====
    
    /**
     * @dev Struct to store individual vote information
     */
    struct Vote {
        uint256 repositoryId;
        uint256 amount;
        uint256 timestamp;
    }
    
    /**
     * @dev Struct to store aggregate repository vote data
     */
    struct RepositoryVoteData {
        uint256 totalVotes;
        uint256 voterCount;
    }
    
    // ===== VOTE TRACKING MAPPINGS =====
    
    /// @dev Array of all votes cast by each user
    mapping(address => Vote[]) public userVotes;
    
    /// @dev Tracks whether a user has voted for a specific repository
    mapping(address => mapping(uint256 => bool)) public hasUserVoted;
    
    /// @dev Aggregate vote data for each repository
    mapping(uint256 => RepositoryVoteData) public repositoryVotes;
    
    /// @dev Tracks the amount each user voted for each repository
    mapping(uint256 => mapping(address => uint256)) public userVotesByRepository;
    
    // ===== VOTING PERIOD STATE VARIABLES =====
    bool public isVotingActive;
    uint256 public votingStartTime;
    uint256 public votingEndTime;
    
    // ===== EVENTS =====
    
    // Events for voting period changes
    event VotingPeriodStarted(uint256 startTime, uint256 endTime);
    event VotingPeriodEnded(uint256 endTime);
    
    // Events for vote casting
    event VoteCast(
        address indexed voter,
        uint256 indexed repositoryId,
        uint256 amount,
        uint256 timestamp
    );
    
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
        
        escrowContract = DEVoterEscrow(_escrow);
        registryContract = RepositoryRegistry(_registry);
        
        // Initialize voting as inactive
        isVotingActive = false;
    }
    
    /**
     * @dev Modifier to ensure function is called only during active voting period
     */
    modifier onlyDuringVoting() {
        require(isVotingActive && block.timestamp <= votingEndTime, "Voting not active");
        _;
    }
    
    /**
     * @dev Get current voting status and time remaining
     * @return active Whether voting is currently active
     * @return remaining Time remaining in seconds (0 if voting is not active)
     */
    function getVotingStatus() external view returns (bool active, uint256 remaining) {
        active = isVotingActive && block.timestamp <= votingEndTime;
        if (active) {
            remaining = votingEndTime - block.timestamp;
        } else {
            remaining = 0;
        }
    }
    
 
    // ===== VOTE VALIDATION FUNCTIONS =====

    /**
     * @dev Validates if a user can vote for a repository with a specific amount
     * @param user Address of the user attempting to vote
     * @param repositoryId ID of the repository to vote for
     * @param amount Amount of tokens to vote with
     * @return valid Whether the vote is valid
     * @return error Error message if the vote is invalid
     */
    function validateVote(address user, uint256 repositoryId, uint256 amount) 
        public view returns (bool valid, string memory error) 
    {
        // Check if voting period is active
        if (!isVotingActive || block.timestamp > votingEndTime) {
            return (false, "Voting period not active");
        }
        
        // Check if user has already voted for this repository
        if (hasUserVoted[user][repositoryId]) {
            return (false, "Already voted for this repository");
        }
        
        // Check if the repository exists and is active
        RepositoryRegistry.Repository memory repo = registryContract.getRepositoryDetails(repositoryId);
        if (repo.maintainer == address(0)) {
            return (false, "Repository does not exist");
        }
        
        if (!repo.isActive) {
            return (false, "Repository not active");
        }
        
        // Check if user has active escrow
        if (!escrowContract.hasActiveEscrow(user)) {
            return (false, "No active escrow");
        }
        
        // Check if user has sufficient escrow balance
        // Get user's escrow amount from the public mapping
        (bool isActive, uint256 escrowAmount,,,,) = escrowContract.escrows(user);
        if (!isActive) {
            return (false, "No active escrow");
        }
        
        if (amount > escrowAmount) {
            return (false, "Insufficient escrow balance");
        }
        
        // Check if amount is greater than zero
        if (amount == 0) {
            return (false, "Vote amount must be greater than zero");
        }
        
        return (true, "");
    }
    
    /**
     * @dev Get user's voting power (escrow amount)
     * @param user Address of the user
     * @return Amount of tokens escrowed by the user
     */
    function getUserVotingPower(address user) external view returns (uint256) {
        if (!escrowContract.hasActiveEscrow(user)) {
            return 0;
        }
        
        (bool isActive, uint256 amount,,,,) = escrowContract.escrows(user);
        return isActive ? amount : 0;
    }
    /**
     * @dev Start a new voting period with specified duration
     * @param duration Duration of the voting period in seconds
     * @notice Only the contract owner can start voting periods
     */
    function startVotingPeriod(uint256 duration) external onlyOwner {
        require(!isVotingActive, "Voting already active");
        require(duration > 0, "Invalid duration");
        
        votingStartTime = block.timestamp;
        votingEndTime = block.timestamp + duration;
        isVotingActive = true;
        
        emit VotingPeriodStarted(votingStartTime, votingEndTime);
    }
    
    /**
     * @dev Manually end the current voting period
     * @notice Only the contract owner can end voting periods
     */
    function endVotingPeriod() external onlyOwner {
        require(isVotingActive, "No active voting period");
        
        isVotingActive = false;
        emit VotingPeriodEnded(block.timestamp);
    }
    
    // ===== VOTE CASTING FUNCTIONS =====
    
    /**
     * @dev Cast a vote for a repository using escrowed tokens
     * @param repositoryId ID of the repository to vote for
     * @param amount Amount of escrowed tokens to vote with
     * @notice Users can only vote once per repository during an active voting period
     */
    function castVote(uint256 repositoryId, uint256 amount) 
        external 
        nonReentrant 
        onlyDuringVoting 
    {
        // Validate the vote
        (bool valid, string memory error) = validateVote(msg.sender, repositoryId, amount);
        require(valid, error);
        
        // Call escrow contract to execute the vote
        escrowContract.castVote(repositoryId, amount);
        
        // Update vote tracking
        userVotes[msg.sender].push(Vote({
            repositoryId: repositoryId,
            amount: amount,
            timestamp: block.timestamp
        }));
        
        hasUserVoted[msg.sender][repositoryId] = true;
        userVotesByRepository[repositoryId][msg.sender] = amount;
        
        // Update repository totals
        if (repositoryVotes[repositoryId].totalVotes == 0) {
            repositoryVotes[repositoryId].voterCount = 1;
        } else {
            repositoryVotes[repositoryId].voterCount++;
        }
        repositoryVotes[repositoryId].totalVotes += amount;
        
        emit VoteCast(msg.sender, repositoryId, amount, block.timestamp);
    }
    
    // ===== VOTING RESULTS AND STATISTICS FUNCTIONS =====
    
    /**
     * @dev Get voting results for a specific repository
     * @param repositoryId ID of the repository to query
     * @return totalVotes Total number of votes cast for the repository
     * @return voterCount Number of unique voters for the repository
     */
    function getVotingResults(uint256 repositoryId) 
        external 
        view 
        returns (uint256 totalVotes, uint256 voterCount) 
    {
        RepositoryVoteData storage data = repositoryVotes[repositoryId];
        return (data.totalVotes, data.voterCount);
    }
    
    /**
     * @dev Get repository ranking compared to other repositories
     * @param repositoryId ID of the repository to rank
     * @param compareIds Array of repository IDs to compare against
     * @return rank Rank of the repository (1 = highest votes)
     */
    function getRepositoryRank(uint256 repositoryId, uint256[] calldata compareIds) 
        external 
        view 
        returns (uint256 rank) 
    {
        uint256 targetVotes = repositoryVotes[repositoryId].totalVotes;
        rank = 1;
        
        for (uint256 i = 0; i < compareIds.length; i++) {
            if (repositoryVotes[compareIds[i]].totalVotes > targetVotes) {
                rank++;
            }
        }
        
        return rank;
    }
    
    /**
     * @dev Get top repositories by vote count (leaderboard)
     * @param repositoryIds Array of repository IDs to rank
     * @param limit Maximum number of results to return
     * @return topRepos Array of repository IDs sorted by vote count (descending)
     * @return voteCounts Array of vote counts corresponding to topRepos
     */
    function getTopRepositories(uint256[] calldata repositoryIds, uint256 limit) 
        external 
        view 
        returns (uint256[] memory topRepos, uint256[] memory voteCounts) 
    {
        require(limit > 0 && limit <= repositoryIds.length, "Invalid limit");
        
        // Create arrays to store results
        uint256[] memory sortedIds = new uint256[](repositoryIds.length);
        uint256[] memory sortedVotes = new uint256[](repositoryIds.length);
        
        // Copy data for sorting
        for (uint256 i = 0; i < repositoryIds.length; i++) {
            sortedIds[i] = repositoryIds[i];
            sortedVotes[i] = repositoryVotes[repositoryIds[i]].totalVotes;
        }
        
        // Simple bubble sort for small arrays (gas-efficient for small datasets)
        for (uint256 i = 0; i < sortedIds.length - 1; i++) {
            for (uint256 j = 0; j < sortedIds.length - i - 1; j++) {
                if (sortedVotes[j] < sortedVotes[j + 1]) {
                    // Swap votes
                    (sortedVotes[j], sortedVotes[j + 1]) = (sortedVotes[j + 1], sortedVotes[j]);
                    // Swap IDs
                    (sortedIds[j], sortedIds[j + 1]) = (sortedIds[j + 1], sortedIds[j]);
                }
            }
        }
        
        // Return only the requested limit
        topRepos = new uint256[](limit);
        voteCounts = new uint256[](limit);
        
        for (uint256 i = 0; i < limit; i++) {
            topRepos[i] = sortedIds[i];
            voteCounts[i] = sortedVotes[i];
        }
        
        return (topRepos, voteCounts);
    }
    
    /**
     * @dev Get detailed voting statistics for a repository
     * @param repositoryId ID of the repository to query
     * @return totalVotes Total votes received
     * @return voterCount Number of unique voters
     * @return averageVoteAmount Average vote amount per vote
     * @return exists Whether the repository has received any votes
     */
    function getRepositoryStatistics(uint256 repositoryId) 
        external 
        view 
        returns (
            uint256 totalVotes, 
            uint256 voterCount, 
            uint256 averageVoteAmount,
            bool exists
        ) 
    {
        RepositoryVoteData storage data = repositoryVotes[repositoryId];
        totalVotes = data.totalVotes;
        voterCount = data.voterCount;
        exists = voterCount > 0;
        
        if (exists) {
            averageVoteAmount = totalVotes / voterCount;
        } else {
            averageVoteAmount = 0;
        }
        
        return (totalVotes, voterCount, averageVoteAmount, exists);
    }
    
    /**
     * @dev Get voting statistics for multiple repositories
     * @param repositoryIds Array of repository IDs to query
     * @return results Array of voting results for each repository
     */
    function getBatchVotingResults(uint256[] calldata repositoryIds) 
        external 
        view 
        returns (RepositoryVoteData[] memory results) 
    {
        results = new RepositoryVoteData[](repositoryIds.length);
        
        for (uint256 i = 0; i < repositoryIds.length; i++) {
            results[i] = repositoryVotes[repositoryIds[i]];
        }
        
        return results;
    }
    
    /**
     * @dev Check if a repository has received any votes
     * @param repositoryId ID of the repository to check
     * @return hasVotes Whether the repository has received votes
     */
    function hasRepositoryReceivedVotes(uint256 repositoryId) 
        external 
        view 
        returns (bool hasVotes) 
    {
        return repositoryVotes[repositoryId].voterCount > 0;
    }
}
