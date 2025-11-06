// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./DEVoterEscrow.sol";
import "./RepositoryRegistry.sol";

error WithdrawalNotAllowed(string reason);
error InvalidWithdrawalAmount(uint256 requested, uint256 available);
error WithdrawalDeadlinePassed(uint256 deadline, uint256 currentTime);

/**
 * @title DEVoterVoting
 * @dev Main voting contract that interfaces with DEVoterEscrow and RepositoryRegistry
 */
contract DEVoterVoting is Ownable, ReentrancyGuard {
    DEVoterEscrow public escrowContract; /**
     * @dev Instance of the DEVoterEscrow contract for managing token escrows.
     */
    RepositoryRegistry public registryContract; /**
     * @dev Instance of the RepositoryRegistry contract for managing registered repositories.
     */
    
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
    mapping(uint256 => mapping(address => uint256)) public userVotesByRepository; /**
     * @dev Mapping from repository ID to user address to the amount of tokens voted by that user for that repository.
     */
    
    // ===== WITHDRAWAL TRACKING MAPPINGS =====
    
    /// @dev Array of all withdrawals made by each user
    mapping(address => WithdrawalRecord[]) public userWithdrawals;
    
    /// @dev Tracks total amount withdrawn by each user for each repository
    mapping(address => mapping(uint256 => uint256)) public totalWithdrawn;
    
    /// @dev Tracks remaining votes available for withdrawal for each user per repository
    mapping(address => mapping(uint256 => uint256)) public remainingVotes;
    
    // ===== VOTING PERIOD STATE VARIABLES =====
    bool public isVotingActive; /**
     * @dev Indicates whether a voting period is currently active.
     */
    uint256 public votingStartTime; /**
     * @dev The timestamp when the current voting period started.
     */
    uint256 public votingEndTime; /**
     * @dev The timestamp when the current voting period will end.
     */
    
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
            address indexed user, /**
             * @dev Emitted when a user performs a partial withdrawal of their vote.
             * @param user The address of the user who withdrew tokens.
             * @param repositoryId The ID of the repository from which tokens were withdrawn.
             * @param withdrawnAmount The amount of tokens withdrawn in this transaction.
             * @param remainingAmount The remaining amount of tokens still available for withdrawal for this vote.
             */
            uint256 indexed repositoryId,
            uint256 withdrawnAmount,
            uint256 remainingAmount
        );
    
        event EmergencyWithdrawalRequiresManualEscrowUpdate(address user, uint256 amount); /**
         * @dev Emitted when an emergency withdrawal is executed but the escrow contract could not be updated automatically.
         * @param user The address of the user whose escrow needs manual adjustment.
         * @param amount The amount that was intended to be withdrawn from escrow.
         */
        event EmergencyWithdrawalExecuted(address user, uint256 repositoryId, uint256 amount, address admin);    /**
         * @dev Emitted when an emergency withdrawal is successfully executed by an admin.
         * @param user The address of the user whose vote was emergency withdrawn.
         * @param repositoryId The ID of the repository from which the vote was withdrawn.
         * @param amount The amount of tokens emergency withdrawn.
         * @param admin The address of the administrator who performed the emergency withdrawal.
         */    
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
    /// @dev Internal helper to check if the voting period is currently active.
    /// @return True if voting is active and current time is within the voting period, false otherwise.
    function _isVotingPeriodActive() internal view returns (bool) {
        return isVotingActive && block.timestamp <= votingEndTime;
    }

    modifier onlyDuringVoting() {
        require(_isVotingPeriodActive(), "Voting not active");
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
        if (!_isVotingPeriodActive()) {
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
        require(!isVotingActive, "VotingPeriod: A voting period is already active");
        require(duration > 0, "VotingPeriod: Duration must be greater than zero");
        
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
        require(isVotingActive, "VotingPeriod: No active voting period to end");
        
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
        // Optimization: Return early if user hasn't voted for this repository.
        if (!hasUserVoted[user][repositoryId]) {
            return (0, 0);
        }

        amount = userVotesByRepository[repositoryId][user];

        // Optimization: Return timestamp immediately when found, avoiding unnecessary looping.
        Vote[] storage votes = userVotes[user];
        for (uint256 i = 0; i < votes.length; i++) {
            if (votes[i].repositoryId == repositoryId) {
                return (amount, votes[i].timestamp);
            }
        }
        // Defensive: Should not reach here, but fallback to (amount, 0) if not found.
        return (amount, 0);
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
        require(repositoryId > 0, "CastVote: Repository ID must be greater than zero");
        require(amount > 0, "CastVote: Vote amount must be greater than zero");

        // Validate the vote using the internal helper function
        (bool valid, string memory error) = validateVote(msg.sender, repositoryId, amount);
        require(valid, string(abi.encodePacked("CastVote: Vote validation failed: ", error)));
        
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
        
        // Increment voter count as this is a new vote for this repository (guaranteed by validateVote)
        repositoryVotes[repositoryId].voterCount++;
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
        internal view returns (uint256 availableAmount) 
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
        uint256 availableAmount = getAvailableWithdrawalAmount(user, repositoryId);
        return amount == availableAmount;
    }

    // ===== ESCROW INTEGRATION FUNCTIONS =====
    
    // ===== VOTE WITHDRAWAL FUNCTIONS =====

    /**
     * @dev Allows a user to withdraw a specified amount of their vote from a repository.
     * Includes comprehensive error handling with custom error types.
     * @param repositoryId The ID of the repository from which to withdraw the vote.
     * @param amount The amount of tokens to withdraw.
     * @notice Withdrawals are subject to a restriction period before the voting ends.
     */
    function withdrawVoteWithErrorHandling(uint256 repositoryId, uint256 amount) 
        external 
        nonReentrant 
        onlyDuringVoting 
    {
        require(repositoryId > 0, "WithdrawVote: Repository ID must be greater than zero");
        require(amount > 0, "WithdrawVote: Withdrawal amount must be greater than zero");

        // Comprehensive validation with custom errors
        if (!hasUserVoted[msg.sender][repositoryId]) {
            revert WithdrawalNotAllowed("WithdrawVote: No vote found for this repository by the user");
        }
        
        uint256 withdrawalDeadline = votingEndTime - WITHDRAWAL_RESTRICTION_PERIOD;
        // Edge case: If votingEndTime is less than WITHDRAWAL_RESTRICTION_PERIOD, withdrawalDeadline could underflow.
        // However, given typical voting durations, this is unlikely. A more robust check would be:
        // require(votingEndTime > WITHDRAWAL_RESTRICTION_PERIOD, "Voting period too short for withdrawal restriction");
        // For now, we assume votingEndTime is sufficiently large.
        if (block.timestamp >= withdrawalDeadline) {
            revert WithdrawalDeadlinePassed(withdrawalDeadline, block.timestamp);
        }
        
        uint256 available = getAvailableWithdrawalAmount(msg.sender, repositoryId);
        if (amount > available) {
            revert InvalidWithdrawalAmount(amount, available);
        }
        
        // Handle potential escrow failures
        try escrowContract.returnVoteTokens(msg.sender, amount) returns (bool success) {
            if (!success) {
                revert WithdrawalNotAllowed("WithdrawVote: Escrow contract rejected withdrawal");
            }
        } catch Error(string memory reason) {
            revert WithdrawalNotAllowed(string(abi.encodePacked("WithdrawVote: Escrow error: ", reason)));
        } catch {
            revert WithdrawalNotAllowed("WithdrawVote: Unknown escrow contract error");
        }
        
        // Continue with withdrawal logic...
        bool isFull = (amount == available);
        
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
         * @dev Allows the contract owner to forcibly withdraw a user's vote from a repository in emergency situations.
         * This function attempts to update the escrow contract but logs an event if it fails, requiring manual intervention.
         * @param user The address of the user whose vote is to be withdrawn.
         * @param repositoryId The ID of the repository from which the vote is to be withdrawn.
         * @param amount The amount of tokens to withdraw. If this exceeds the available amount, the available amount will be withdrawn.
         * @notice This function is for emergency use only and bypasses normal withdrawal restrictions.
         */
        function emergencyWithdrawalOverride(address user, uint256 repositoryId, uint256 amount)
            external onlyOwner
        {
            require(user != address(0), "EmergencyWithdrawal: User address cannot be zero");
            require(repositoryId > 0, "EmergencyWithdrawal: Repository ID must be greater than zero");
            require(amount > 0, "EmergencyWithdrawal: Withdrawal amount must be greater than zero");
            require(hasUserVoted[user][repositoryId], "EmergencyWithdrawal: User has no vote to withdraw for this repository");
    
            uint256 available = getAvailableWithdrawalAmount(user, repositoryId);
            uint256 actualWithdrawalAmount;
    
            if (amount > available) {
                actualWithdrawalAmount = available; // Cap at available
            } else {
                actualWithdrawalAmount = amount; // Use the requested amount
            }
    
            // Update withdrawal tracking
            remainingVotes[user][repositoryId] -= actualWithdrawalAmount;
            totalWithdrawn[user][repositoryId] += actualWithdrawalAmount;
    
            bool isFull = (actualWithdrawalAmount == available);
    
            // Update repository vote totals and user vote tracking
            updateRepositoryTotals(user, repositoryId, actualWithdrawalAmount, isFull);
    
            // Try to update escrow, but don't fail if it doesn't work
            try escrowContract.returnVoteTokens(user, actualWithdrawalAmount) {
                // Success - no action needed
            } catch {
                // Log for manual resolution
                emit EmergencyWithdrawalRequiresManualEscrowUpdate(user, actualWithdrawalAmount);
            }
    
            emit EmergencyWithdrawalExecuted(user, repositoryId, actualWithdrawalAmount, msg.sender);

            // Emit partial withdrawal event if there are remaining votes
            if (!isFull) {
                emit PartialWithdrawal(
                    user,
                    repositoryId,
                    actualWithdrawalAmount,
                    remainingVotes[user][repositoryId]
                );
            }
        }
    /**
     * @dev Internal function to update repository vote totals and user vote tracking after a withdrawal.
     * @param user The address of the user who performed the withdrawal.
     * @param repositoryId The ID of the repository affected.
     * @param amount The amount of tokens withdrawn.
     * @param fullWithdrawal True if this was a full withdrawal of the user's vote for the repository, false otherwise.
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
     * @dev Get voting results for a repository (simple version of getRepositoryStats)
     * @param repositoryId ID of the repository
     * @return totalVotes Total votes for the repository
     * @return voterCount Number of voters for the repository
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
     * @dev Get the rank of a repository compared to a list of other repositories
     * @param repositoryId ID of the target repository
     * @param compareIds Array of repository IDs to compare against
     * @return rank The rank of the repository (1 = highest votes)
     */
    function getRepositoryRank(uint256 repositoryId, uint256[] calldata compareIds) 
        external 
        view 
        returns (uint256 rank) 
    {
        require(repositoryId > 0, "GetRepositoryRank: Repository ID must be greater than zero");
        require(compareIds.length > 0, "GetRepositoryRank: Comparison list cannot be empty");

        uint256 targetVotes = repositoryVotes[repositoryId].totalVotes;
        rank = 1;
        
        for (uint256 i = 0; i < compareIds.length; i++) {
            // Edge case: Ensure compareIds[i] is a valid repository ID if necessary, though current logic handles non-existent IDs by returning 0 votes.
            if (repositoryVotes[compareIds[i]].totalVotes > targetVotes) {
                rank++;
            }
        }
    }

    /**
     * @dev Get top repositories by vote count from a given list
     * @param repositoryIds Array of repository IDs to rank
     * @param limit Maximum number of results to return
     * @return topIds Array of repository IDs ranked by vote count (highest first)
     * @return topVotes Array of vote counts corresponding to the ranked repositories
     */
    function getTopRepositories(uint256[] calldata repositoryIds, uint256 limit) 
        external 
        view 
        returns (uint256[] memory topIds, uint256[] memory topVotes) 
    {
        require(limit > 0, "GetTopRepositories: Limit must be greater than zero");
        require(repositoryIds.length > 0, "GetTopRepositories: Repository ID list cannot be empty");
        
        uint256 resultLength = limit > repositoryIds.length ? repositoryIds.length : limit;
        topIds = new uint256[](resultLength);
        topVotes = new uint256[](resultLength);
        
        // Create temporary arrays for sorting
        uint256[] memory tempIds = new uint256[](repositoryIds.length);
        uint256[] memory tempVotes = new uint256[](repositoryIds.length);
        
        // Copy data for sorting
        for (uint256 i = 0; i < repositoryIds.length; i++) {
            tempIds[i] = repositoryIds[i];
            tempVotes[i] = repositoryVotes[repositoryIds[i]].totalVotes;
        }
        
        // Selection sort (descending order by votes)
        for (uint256 i = 0; i < repositoryIds.length; i++) {
            uint256 maxIdx = i;
            for (uint256 j = i + 1; j < repositoryIds.length; j++) {
                if (tempVotes[j] > tempVotes[maxIdx]) {
                    maxIdx = j;
                }
            }
            if (maxIdx != i) {
                // Swap votes
                uint256 tempVote = tempVotes[i];
                tempVotes[i] = tempVotes[maxIdx];
                tempVotes[maxIdx] = tempVote;
                // Swap IDs
                uint256 tempId = tempIds[i];
                tempIds[i] = tempIds[maxIdx];
                tempIds[maxIdx] = tempId;
            }
        }
        
        // Copy top results
        for (uint256 i = 0; i < resultLength; i++) {
            topIds[i] = tempIds[i];
            topVotes[i] = tempVotes[i];
        }
        
        return (topIds, topVotes);
    }

    /**
     * @dev Get batch voting results for multiple repositories
     * @param repositoryIds Array of repository IDs
     * @return totalVotes Array of total votes for each repository
     * @return voterCounts Array of voter counts for each repository
     */
    function getBatchVotingResults(uint256[] calldata repositoryIds) 
        external 
        view 
        returns (uint256[] memory totalVotes, uint256[] memory voterCounts) 
    {
        require(repositoryIds.length > 0, "GetBatchVotingResults: Repository ID list cannot be empty");

        totalVotes = new uint256[](repositoryIds.length);
        voterCounts = new uint256[](repositoryIds.length);
        
        for (uint256 i = 0; i < repositoryIds.length; i++) {
            RepositoryVoteData storage data = repositoryVotes[repositoryIds[i]];
            totalVotes[i] = data.totalVotes;
            voterCounts[i] = data.voterCount;
        }
        
        return (totalVotes, voterCounts);
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
        require(user != address(0), "GetUserCurrentVoteAmount: User address cannot be zero");
        require(repositoryId > 0, "GetUserCurrentVoteAmount: Repository ID must be greater than zero");

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
        require(user != address(0), "GetTotalWithdrawnByUser: User address cannot be zero");
        require(repositoryId > 0, "GetTotalWithdrawnByUser: Repository ID must be greater than zero");

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
        require(user != address(0), "GetRemainingVotes: User address cannot be zero");
        require(repositoryId > 0, "GetRemainingVotes: Repository ID must be greater than zero");

        return remainingVotes[user][repositoryId];
    }

    /**
     * @dev Calculate what user's escrow balance would be after a withdrawal
     * @param user Address of the user
     * @param amount Amount to be withdrawn
     * @return projectedBalance Projected escrow balance after withdrawal
     */
    function getEscrowBalanceAfterWithdrawal(address user, uint256 repositoryId, uint256 amount)
        external 
        view 
        returns (uint256 projectedBalance)
    {
        require(user != address(0), "GetEscrowBalanceAfterWithdrawal: User address cannot be zero");
        require(repositoryId > 0, "GetEscrowBalanceAfterWithdrawal: Repository ID must be greater than zero");
        require(amount > 0, "GetEscrowBalanceAfterWithdrawal: Amount must be greater than zero");

        (bool isActive, uint256 currentBalance,,,,) = escrowContract.escrows(user);
        if (!isActive) {
            // If no active escrow, the projected balance would simply be the amount being withdrawn
            // as it implies the user is receiving tokens back without an existing escrow to add to.
            return amount; 
        }
        return currentBalance + amount;
    }
}
