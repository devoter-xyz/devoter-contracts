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
    
    /**
     * @dev Struct to store individual withdrawal information
     */
    struct WithdrawalRecord {
        uint256 repositoryId;
        uint256 amount;
        uint256 timestamp;
        bool isActive;
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
    
    // ===== WITHDRAWAL TRACKING MAPPINGS =====
    
    /// @dev Array of all withdrawals made by each user
    mapping(address => WithdrawalRecord[]) public userWithdrawals;
    
    /// @dev Tracks total amount withdrawn by each user for each repository
    mapping(address => mapping(uint256 => uint256)) public totalWithdrawn;
    
    /// @dev Tracks remaining votes available for withdrawal for each user per repository
    mapping(address => mapping(uint256 => uint256)) public remainingVotes;
    
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
    
    // Events for vote withdrawals
    event VoteWithdrawn(
        address indexed user,
        uint256 indexed repositoryId,
        uint256 amount,
        uint256 timestamp
    );
    
    event PartialWithdrawal(
        address indexed user,
        uint256 indexed repositoryId,
        uint256 withdrawnAmount,
        uint256 remainingAmount
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
    

    // ===== USER VOTE QUERY FUNCTIONS =====
    
    /**
     * @dev Get all votes cast by a user
     * @param user Address of the user
     * @return repositoryIds Array of repository IDs the user voted for
     * @return amounts Array of vote amounts corresponding to each repository
     * @return timestamps Array of timestamps when each vote was cast
     */
    function getUserVotes(address user) 
        external 
        view 
        returns (uint256[] memory repositoryIds, uint256[] memory amounts, uint256[] memory timestamps) 
    {
        Vote[] storage votes = userVotes[user];
        uint256 length = votes.length;
        
        repositoryIds = new uint256[](length);
        amounts = new uint256[](length);
        timestamps = new uint256[](length);
        
        for (uint256 i = 0; i < length; i++) {
            repositoryIds[i] = votes[i].repositoryId;
            amounts[i] = votes[i].amount;
            timestamps[i] = votes[i].timestamp;
        }
        
        return (repositoryIds, amounts, timestamps);
    }
    
    /**
     * @dev Get a user's vote for a specific repository
     * @param user Address of the user
     * @param repositoryId ID of the repository
     * @return amount Amount of tokens voted (0 if user hasn't voted)
     * @return timestamp Timestamp when the vote was cast (0 if user hasn't voted)
     */
    function getUserVoteForRepository(address user, uint256 repositoryId) 
        external 
        view 
        returns (uint256 amount, uint256 timestamp) 
    {
        if (!hasUserVoted[user][repositoryId]) {
            return (0, 0);
        }
        
        amount = userVotesByRepository[repositoryId][user];
        
        // Find timestamp from user votes array
        Vote[] storage votes = userVotes[user];
        for (uint256 i = 0; i < votes.length; i++) {
            if (votes[i].repositoryId == repositoryId) {
                timestamp = votes[i].timestamp;
                break;
            }
        }
        
        return (amount, timestamp);
    }
    
    /**
     * @dev Get the total number of votes cast by a user
     * @param user Address of the user
     * @return count Number of repositories the user has voted for
     */
    function getUserVoteCount(address user) external view returns (uint256 count) {
        return userVotes[user].length;
    }
    
    /**
     * @dev Check if a user has voted for a specific repository
     * @param user Address of the user
     * @param repositoryId ID of the repository
     * @return hasVoted Whether the user has voted for this repository
     */
    function hasUserVotedForRepository(address user, uint256 repositoryId) 
        external 
        view 
        returns (bool hasVoted) 
    {
        return hasUserVoted[user][repositoryId];
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
        
        // Initialize remaining votes for withdrawal tracking
        remainingVotes[msg.sender][repositoryId] = amount;
        
        // Update repository totals
        if (repositoryVotes[repositoryId].totalVotes == 0) {
            repositoryVotes[repositoryId].voterCount = 1;
        } else {
            repositoryVotes[repositoryId].voterCount++;
        }
        repositoryVotes[repositoryId].totalVotes += amount;
        
        emit VoteCast(msg.sender, repositoryId, amount, block.timestamp);

    }
}
