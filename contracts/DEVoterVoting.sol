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
    
    // ===== WITHDRAWAL RESTRICTION CONSTANTS =====
    /// @dev 24-hour withdrawal restriction period before voting ends
    uint256 public constant WITHDRAWAL_RESTRICTION_PERIOD = 24 hours;
    
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

    // ===== WITHDRAWAL RESTRICTION FUNCTIONS =====
    
    /**
     * @dev Check if a user can withdraw their vote for a repository
     * @param user Address of the user attempting to withdraw
     * @param repositoryId ID of the repository to withdraw vote from
     * @return allowed Whether withdrawal is allowed
     * @return reason Explanation message for the decision
     */
    function canWithdrawVote(address user, uint256 repositoryId) 
        public view returns (bool allowed, string memory reason) 
    {
        // Check if voting period is active
        if (!isVotingActive) {
            return (false, "Voting period not active");
        }
        
        // Check if user has voted for this repository
        if (!hasUserVoted[user][repositoryId]) {
            return (false, "No vote to withdraw");
        }
        
        // Check if user has any remaining votes to withdraw
        if (remainingVotes[user][repositoryId] == 0) {
            return (false, "No remaining votes to withdraw");
        }
        
        // Check if we're within the 24-hour restriction period
        uint256 withdrawalDeadline = votingEndTime - WITHDRAWAL_RESTRICTION_PERIOD;
        if (block.timestamp >= withdrawalDeadline) {
            return (false, "Cannot withdraw within 24 hours of voting end");
        }
        
        return (true, "Withdrawal allowed");
    }
    
    /**
     * @dev Get the deadline timestamp after which withdrawals are no longer allowed
     * @return deadline Timestamp of withdrawal deadline (0 if voting not active)
     */
    function getWithdrawalDeadline() external view returns (uint256 deadline) {
        if (!isVotingActive) {
            return 0;
        }
        return votingEndTime - WITHDRAWAL_RESTRICTION_PERIOD;
    }
    
    /**
     * @dev Get time remaining until withdrawal deadline
     * @return timeRemaining Seconds until withdrawal deadline (0 if deadline passed or voting not active)
     */
    function getTimeUntilWithdrawalDeadline() external view returns (uint256 timeRemaining) {
        if (!isVotingActive) {
            return 0;
        }
        
        uint256 deadline = votingEndTime - WITHDRAWAL_RESTRICTION_PERIOD;
        if (block.timestamp >= deadline) {
            return 0;
        }
        
        return deadline - block.timestamp;
    }
    
    /**
     * @dev Check if we're currently in the withdrawal restriction period
     * @return inRestrictionPeriod Whether we're in the 24-hour restriction period
     * @return timeUntilVotingEnds Seconds until voting period ends
     */
    function isWithinRestrictionPeriod() external view returns (bool inRestrictionPeriod, uint256 timeUntilVotingEnds) {
        if (!isVotingActive) {
            return (false, 0);
        }
        
        uint256 deadline = votingEndTime - WITHDRAWAL_RESTRICTION_PERIOD;
        inRestrictionPeriod = block.timestamp >= deadline;
        timeUntilVotingEnds = votingEndTime > block.timestamp ? votingEndTime - block.timestamp : 0;
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
    
    // ===== WITHDRAWAL AMOUNT VALIDATION FUNCTIONS =====
    
    /**
     * @dev Validates withdrawal amount against user's vote balance
     * @param user Address of the user attempting to withdraw
     * @param repositoryId ID of the repository to withdraw from
     * @param amount Amount to withdraw
     * @return valid Whether the withdrawal amount is valid
     * @return error Error message if withdrawal is invalid
     */
    function validateWithdrawalAmount(address user, uint256 repositoryId, uint256 amount)
        internal view returns (bool valid, string memory error)
    {
        if (amount == 0) {
            return (false, "Withdrawal amount must be greater than 0");
        }
        
        uint256 originalVote = userVotesByRepository[repositoryId][user];
        if (originalVote == 0) {
            return (false, "No vote found for this repository");
        }
        
        uint256 alreadyWithdrawn = totalWithdrawn[user][repositoryId];
        uint256 availableToWithdraw = originalVote - alreadyWithdrawn;
        
        if (amount > availableToWithdraw) {
            return (false, "Insufficient vote balance to withdraw");
        }
        
        return (true, "");
    }
    
    /**
     * @dev Get available withdrawal amount for a user and repository
     * @param user Address of the user
     * @param repositoryId ID of the repository
     * @return availableAmount Amount available for withdrawal
     */
    function getAvailableWithdrawalAmount(address user, uint256 repositoryId) 
        external view returns (uint256 availableAmount) 
    {
        if (!hasUserVoted[user][repositoryId]) {
            return 0;
        }
        
        uint256 originalVote = userVotesByRepository[repositoryId][user];
        uint256 alreadyWithdrawn = totalWithdrawn[user][repositoryId];
        return originalVote - alreadyWithdrawn;
    }
    
    /**
     * @dev Check if withdrawal amount represents a full withdrawal
     * @param user Address of the user
     * @param repositoryId ID of the repository
     * @param amount Amount to withdraw
     * @return isFull Whether this is a full withdrawal
     */
    function isFullWithdrawal(address user, uint256 repositoryId, uint256 amount)
        internal view returns (bool isFull)
    {
        uint256 availableAmount = this.getAvailableWithdrawalAmount(user, repositoryId);
        return amount == availableAmount;
    }

    // ===== ESCROW INTEGRATION FUNCTIONS =====
    
    /**
     * @dev Updates user's escrow balance by returning withdrawn vote tokens
     * Will be fully implemented when DEVoterEscrow.returnVoteTokens is available
     */
    function updateEscrowBalance(address /*user*/, uint256 /*amount*/) internal view {
        // Call escrow contract to return tokens
        // Note: This requires the returnVoteTokens function to be implemented in DEVoterEscrow
        // For now, we'll add a require statement that will fail gracefully until implemented
        
        // Uncomment the following lines when DEVoterEscrow.returnVoteTokens is implemented:
        // bool success = escrowContract.returnVoteTokens(user, amount);
        // require(success, "Failed to update escrow balance");
        
        // Temporary implementation - just validate the contract exists
        require(address(escrowContract) != address(0), "Escrow contract not set");
    }

    // ===== VOTE WITHDRAWAL FUNCTIONS =====

    /**
     * @dev Withdraw a vote for a repository (full or partial withdrawal)
     * @param repositoryId ID of the repository to withdraw vote from
     * @param amount Amount to withdraw (must be <= remaining votes)
     * @notice Withdrawals are blocked within 24 hours of voting period end
     */
    function withdrawVote(uint256 repositoryId, uint256 amount) 
        external 
        nonReentrant 
        onlyDuringVoting 
    {
        // Validate withdrawal using our new restriction logic
        (bool allowed, string memory reason) = canWithdrawVote(msg.sender, repositoryId);
        require(allowed, reason);
        
        // Validate withdrawal amount using new validation function
        (bool validAmount, string memory amountError) = validateWithdrawalAmount(msg.sender, repositoryId, amount);
        require(validAmount, amountError);
        
        // Check if this is a full withdrawal for cleanup logic
        bool isFull = isFullWithdrawal(msg.sender, repositoryId, amount);
        
        // Update escrow balance before state changes
        updateEscrowBalance(msg.sender, amount);
        
        // Update withdrawal tracking
        remainingVotes[msg.sender][repositoryId] -= amount;
        totalWithdrawn[msg.sender][repositoryId] += amount;
        
        // Record the withdrawal
        userWithdrawals[msg.sender].push(WithdrawalRecord({
            repositoryId: repositoryId,
            amount: amount,
            timestamp: block.timestamp,
            isActive: true
        }));
        // Update repository vote totals and user vote tracking
        updateRepositoryTotals(msg.sender, repositoryId, amount, isFull);
        emit VoteWithdrawn(msg.sender, repositoryId, amount, block.timestamp);
        // Emit partial withdrawal event if there are remaining votes
        if (!isFull) {
            emit PartialWithdrawal(
                msg.sender, 
                repositoryId, 
                amount, 
                remainingVotes[msg.sender][repositoryId]
            );
        }
    }
    /**
     * @dev Internal function to update repository vote totals and user vote tracking on withdrawal
     * @param user Address of the user
     * @param repositoryId ID of the repository
     * @param amount Amount withdrawn
    * @param fullWithdrawal Whether this is a full withdrawal
     */
    function updateRepositoryTotals(address user, uint256 repositoryId, uint256 amount, bool fullWithdrawal) internal {
        RepositoryVoteData storage repoData = repositoryVotes[repositoryId];
        // Always decrease total votes
        repoData.totalVotes -= amount;
        if (fullWithdrawal) {
            // Only decrease voter count for full withdrawals
            if (repoData.voterCount > 0) {
                repoData.voterCount--;
            }
            // Update user vote amount to 0 for full withdrawal
            userVotesByRepository[repositoryId][user] = 0;
        } else {
            // Update remaining vote amount for partial withdrawal
            if (userVotesByRepository[repositoryId][user] >= amount) {
                userVotesByRepository[repositoryId][user] -= amount;
            } else {
                userVotesByRepository[repositoryId][user] = 0;
            }
        }
    }
    /**
     * @dev Get repository statistics: total votes, voter count, and average vote amount
     * @param repositoryId ID of the repository
     * @return totalVotes Total votes for the repository
     * @return voterCount Number of voters for the repository
     * @return averageVoteAmount Average vote amount per voter
     */
    function getRepositoryStats(uint256 repositoryId)
        external
        view
        returns (
            uint256 totalVotes,
            uint256 voterCount,
            uint256 averageVoteAmount
        )
    {
        RepositoryVoteData storage data = repositoryVotes[repositoryId];
        totalVotes = data.totalVotes;
        voterCount = data.voterCount;
        if (voterCount > 0) {
            averageVoteAmount = totalVotes / voterCount;
        } else {
            averageVoteAmount = 0;
        }
    }

    /**
     * @dev Get the user's current vote amount for a repository (original - withdrawn)
     * @param user Address of the user
     * @param repositoryId ID of the repository
     * @return currentVoteAmount User's current vote amount for the repository
     */
    function getUserCurrentVoteAmount(address user, uint256 repositoryId)
        external
        view
        returns (uint256 currentVoteAmount)
    {
        uint256 originalVote = userVotesByRepository[repositoryId][user];
        uint256 withdrawn = totalWithdrawn[user][repositoryId];
        if (originalVote > withdrawn) {
            return originalVote - withdrawn;
        } else {
            return 0;
        }
    }
    
    /**
     * @dev Get withdrawal history for a user
     * @param user Address of the user
     * @return withdrawals Array of withdrawal records
     */
    function getUserWithdrawals(address user) 
        external 
        view 
        returns (WithdrawalRecord[] memory withdrawals) 
    {
        return userWithdrawals[user];
    }
    
    /**
     * @dev Get total amount withdrawn by a user for a specific repository
     * @param user Address of the user
     * @param repositoryId ID of the repository
     * @return totalAmount Total amount withdrawn
     */
    function getTotalWithdrawnByUser(address user, uint256 repositoryId) 
        external 
        view 
        returns (uint256 totalAmount) 
    {
        return totalWithdrawn[user][repositoryId];
    }
    
    /**
     * @dev Get remaining votes available for withdrawal for a user and repository
     * @param user Address of the user
     * @param repositoryId ID of the repository
     * @return remaining Remaining votes available for withdrawal
     */
    function getRemainingVotes(address user, uint256 repositoryId) 
        external 
        view 
        returns (uint256 remaining) 
    {
        return remainingVotes[user][repositoryId];
    }

    /**
     * @dev Calculate what user's escrow balance would be after a withdrawal
     * @param user Address of the user
     * @param amount Amount to be withdrawn
     * @return projectedBalance Projected escrow balance after withdrawal
     */
    function getEscrowBalanceAfterWithdrawal(address user, uint256 /*repositoryId*/, uint256 amount)
        external 
        view 
        returns (uint256 projectedBalance)
    {
        (bool isActive, uint256 currentBalance,,,,) = escrowContract.escrows(user);
        if (!isActive) {
            return amount; // If no active escrow, balance would just be the withdrawal amount
        }
        return currentBalance + amount;
    }
}
