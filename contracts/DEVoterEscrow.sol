// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract DEVoterEscrow is ReentrancyGuard, Ownable, Pausable, AccessControl {
    using SafeERC20 for IERC20;

    // Access Control Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 public constant VOTING_CONTRACT_ROLE = keccak256("VOTING_CONTRACT_ROLE");

    // Constants for fee calculation
    uint256 public constant BASIS_POINTS_DENOMINATOR = 10000; // 100% = 10000 basis points
    uint256 public constant MAX_FEE_BASIS_POINTS = 500; // 5% maximum fee (500 basis points)
    uint256 public constant MIN_FEE_BASIS_POINTS = 0; // 0% minimum fee

    IERC20 public immutable token;
    address public feeWallet;
    uint256 public feeBasisPoints; // Fee in basis points (1 basis point = 0.01%)
    uint256 public votingPeriod;

    // Fee exemption mapping
    mapping(address => bool) public feeExemptions;

    // Contract state tracking
    uint256 public totalEscrowedAmount;
    uint256 public totalFeesCollected;
    uint256 public totalActiveEscrows;
    mapping(address => bool) public hasActiveEscrow;

    struct EscrowData {
        bool isActive;
        uint256 amount;
        uint256 depositTimestamp;
        uint256 releaseTimestamp;
        uint256 feePaid; // Track fee paid for this escrow
        uint256 votesCast; // Track total votes cast by the user
    }

    mapping(address => EscrowData) public escrows;


    // Comprehensive Events System
    event TokensEscrowed(
        address indexed user, 
        uint256 indexed escrowId,
        uint256 amount, 
        uint256 releaseTime,
        uint256 votingPeriod
    );

    // Mappings for vote tracking
    mapping(address => mapping(uint256 => uint256)) public userVotesPerRepo;
    mapping(uint256 => uint256) public totalVotesPerRepo;

    address public devoterVotingContractAddress; // New state variable


    event TokensDeposited(
        address indexed user, 
        uint256 amount, 
        uint256 feePaid, 
        uint256 amountEscrowed, 
        uint256 releaseTimestamp
    );
    event TokensReleased(
        address indexed user, 
        uint256 amount,
        uint256 releaseTime,
        bool wasForced
    );
    // Removed unused VoteCast event. Only VoteCasted is used for voting actions.
    // Rationale: Only one event is needed for vote actions to avoid confusion and redundancy.
    event FeeParametersUpdated(
        uint256 newFeePercentage, 
        address indexed newFeeCollector,
        address indexed updatedBy
    );
    event EmergencyWithdrawal(
        address indexed admin, 
        address indexed user, 
        uint256 amount,
        string reason
    );
    event FeeBasisPointsUpdated(uint256 oldFeeBasisPoints, uint256 newFeeBasisPoints);
    event FeeWalletUpdated(address indexed oldFeeWallet, address indexed newFeeWallet);
    event FeeExemptionUpdated(address indexed user, bool isExempt);
    event FeeCollected(address indexed user, uint256 feeAmount);
    event TokensForceReleased(address indexed user, uint256 amount, address indexed releasedBy);

    event ContractPaused(address indexed admin, uint256 timestamp);
    event ContractUnpaused(address indexed admin, uint256 timestamp);
    event EscrowStateChanged(address indexed user, bool isActive, uint256 amount);
    event VotingPeriodUpdated(uint256 oldPeriod, uint256 newPeriod, address indexed updatedBy);

    event VoteCasted(address indexed user, uint256 indexed repositoryId, uint256 amount);


    constructor(
        address _tokenAddress,
        address _feeWallet,
        uint256 _feeBasisPoints,
        uint256 _votingPeriod,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_tokenAddress != address(0), "Token address cannot be zero");
        require(_feeWallet != address(0), "Fee wallet cannot be zero");
        require(_feeBasisPoints <= MAX_FEE_BASIS_POINTS, "Fee exceeds maximum allowed");
        require(_votingPeriod > 0, "Voting period must be greater than 0");

        token = IERC20(_tokenAddress);
        feeWallet = _feeWallet;
        feeBasisPoints = _feeBasisPoints;
        votingPeriod = _votingPeriod;


        // Set up access control
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(ADMIN_ROLE, initialOwner);
        _grantRole(EMERGENCY_ROLE, initialOwner);
    }

    // Access Control Modifiers
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender) || owner() == msg.sender, "Caller is not an admin");
        _;
    }

    modifier onlyEmergency() {
        require(hasRole(EMERGENCY_ROLE, msg.sender) || owner() == msg.sender, "Caller does not have emergency role");
        _;
    }

    modifier onlyVotingContract() {
        require(msg.sender == devoterVotingContractAddress, "Caller is not the DEVoterVoting contract");
        _;
    }

    /**
     * @dev Sets the address of the DEVoterVoting contract and grants it the VOTING_CONTRACT_ROLE.
     * @param _votingContractAddress The address of the DEVoterVoting contract.
     */
    function setVotingContractAddress(address _votingContractAddress) external onlyOwner {
        require(_votingContractAddress != address(0), "Invalid voting contract address");
        devoterVotingContractAddress = _votingContractAddress;
        _grantRole(VOTING_CONTRACT_ROLE, _votingContractAddress);
        // Optionally, revoke from previous if needed, but for initial setup, granting is enough.
    }

    modifier whenNotPausedOrEmergency() {
        require(!paused() || hasRole(EMERGENCY_ROLE, msg.sender), "Pausable: paused");
        _;
    }

    /**
     * @dev Calculate fee amount based on basis points
     * @param amount The amount to calculate fee for
     * @param user The user address (for exemption check)
     * @return feeAmount The calculated fee amount
     */
    function calculateFee(uint256 amount, address user) public view returns (uint256 feeAmount) {
        if (amount == 0) return 0;
        if (feeExemptions[user]) return 0;
        if (feeBasisPoints == 0) return 0;

        // Calculate fee using basis points for precision
        feeAmount = (amount * feeBasisPoints) / BASIS_POINTS_DENOMINATOR;
        
        // Ensure fee doesn't exceed the amount
        if (feeAmount > amount) {
            feeAmount = amount;
        }
    }

    /**
     * @dev Calculate the amount that will be escrowed after fee deduction
     * @param amount The total amount to be deposited
     * @param user The user address (for exemption check)
     * @return escrowedAmount The amount that will be escrowed
     * @return feeAmount The fee amount that will be charged
     */
    function calculateEscrowAmount(uint256 amount, address user) 
        public 
        view 
        returns (uint256 escrowedAmount, uint256 feeAmount) 
    {
        feeAmount = calculateFee(amount, user);
        escrowedAmount = amount - feeAmount;
    }

    /**
     * @dev Preview fee calculation for a user
     * @param amount The amount to calculate fee for
     * @param user The user address
     * @return feeAmount The calculated fee amount
     * @return escrowedAmount The amount that would be escrowed
     * @return isExempt Whether the user is fee exempt
     */
    function previewFee(uint256 amount, address user) 
        external 
        view 
        returns (
            uint256 feeAmount, 
            uint256 escrowedAmount, 
            bool isExempt
        ) 
    {
        isExempt = feeExemptions[user];
        feeAmount = calculateFee(amount, user);
        escrowedAmount = amount - feeAmount;
    }

    /**
     * @dev Deposit tokens with fee calculation
     * @param _amount The amount of tokens to deposit
     */
    function deposit(uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount > 0, "Deposit amount must be greater than 0");
        require(!escrows[msg.sender].isActive, "User already has an active escrow");

        uint256 feeAmount = calculateFee(_amount, msg.sender);
        uint256 escrowedAmount = _amount - feeAmount;

        token.safeTransferFrom(msg.sender, address(this), _amount);

        // Transfer fee if applicable
        if (feeAmount > 0) {
            token.safeTransfer(feeWallet, feeAmount);
            emit FeeCollected(msg.sender, feeAmount);
        }

        // Update contract state
        totalEscrowedAmount += escrowedAmount;
        totalFeesCollected += feeAmount;
        totalActiveEscrows++;
        hasActiveEscrow[msg.sender] = true;

        uint256 releaseTimestamp = calculateReleaseTimestamp(block.timestamp);

        escrows[msg.sender] = EscrowData({
            isActive: true,
            amount: escrowedAmount,
            depositTimestamp: block.timestamp,
            releaseTimestamp: releaseTimestamp,
            feePaid: feeAmount,
            votesCast: 0
        });

        emit TokensDeposited(
            msg.sender, 
            _amount, 
            feeAmount, 
            escrowedAmount, 
            releaseTimestamp
        );

        emit TokensEscrowed(
            msg.sender,
            uint256(uint160(msg.sender)), // Using address as escrow ID
            escrowedAmount,
            releaseTimestamp,
            votingPeriod
        );

        emit EscrowStateChanged(msg.sender, true, escrowedAmount);
    }


    /**
     * @dev Release escrowed tokens (merged logic from release and releaseTokens)
     */
    function releaseTokens() external nonReentrant whenNotPausedOrEmergency {
        EscrowData storage escrow = escrows[msg.sender];
        require(escrow.isActive, "No active escrow for this user");
        require(block.timestamp >= escrow.releaseTimestamp, "Voting period is not over yet");

        uint256 amount = escrow.amount;

        // Update contract state
        totalEscrowedAmount -= amount;
        totalActiveEscrows--;
        hasActiveEscrow[msg.sender] = false;

        escrow.isActive = false;
        escrow.amount = 0;

        token.safeTransfer(msg.sender, amount);

        emit TokensReleased(msg.sender, amount, block.timestamp, false);
        emit EscrowStateChanged(msg.sender, false, 0);
    }

    /**
     * @dev Allows the owner to forcibly release tokens for a user.
     * @param user The address of the user whose tokens are to be released.
     */
    function forceReleaseTokens(address user) external onlyOwner nonReentrant {
        EscrowData storage escrow = escrows[user];
        require(escrow.isActive, "No active escrow for this user");

        uint256 amount = escrow.amount;
        
        // Update contract state
        totalEscrowedAmount -= amount;
        totalActiveEscrows--;
        hasActiveEscrow[user] = false;
        
        escrow.isActive = false;
        escrow.amount = 0;

        token.safeTransfer(user, amount);

        emit TokensForceReleased(user, amount, msg.sender);
        emit TokensReleased(user, amount, block.timestamp, true);
        emit EscrowStateChanged(user, false, 0);
    }

    /**
     * @dev Allows the DEVoterVoting contract to return a specific amount of vote tokens to a user.
     * @param user The user whose tokens are to be returned.
     * @param amount The amount of tokens to return.
     */
    function returnVoteTokens(address user, uint256 amount) external onlyVotingContract nonReentrant returns (bool) {
        EscrowData storage escrow = escrows[user];
        require(escrow.isActive, "No active escrow for this user");
        require(amount > 0, "Amount must be greater than 0");
        require(escrow.amount >= amount, "Insufficient escrow balance for withdrawal");

        // Update escrowed amount
        // Adjust votesCast to maintain invariant votesCast <= amount
        escrow.votesCast = escrow.votesCast > amount ? escrow.votesCast - amount : 0;
        escrow.amount -= amount;

        // If escrowed amount becomes 0, deactivate escrow
        if (escrow.amount == 0) {
            escrow.isActive = false;
            totalActiveEscrows--;
            hasActiveEscrow[user] = false;
        }

        totalEscrowedAmount -= amount;
        token.safeTransfer(user, amount);

        emit TokensReleased(user, amount, block.timestamp, true); // Consider if a new event is needed
        emit EscrowStateChanged(user, escrow.isActive, escrow.amount);
        return true;
    }

    // Emergency Functions
    
    /**
     * @dev Emergency pause functionality - can be called by emergency role
     */
    function pauseContract() external onlyEmergency {
        _pause();
        emit ContractPaused(msg.sender, block.timestamp);
    }

    /**
     * @dev Emergency unpause functionality - can be called by emergency role
     */
    function unpauseContract() external onlyEmergency {
        _unpause();
        emit ContractUnpaused(msg.sender, block.timestamp);
    }

    /**
     * @dev Emergency withdrawal for admin - allows emergency withdrawal of user funds
     * @param user The user whose tokens should be emergency withdrawn
     * @param reason The reason for emergency withdrawal
     */
    function emergencyWithdraw(address user, string calldata reason) external onlyEmergency {
        EscrowData storage escrow = escrows[user];
        require(escrow.isActive, "No active escrow for this user");
        require(bytes(reason).length > 0, "Emergency reason required");

        uint256 amount = escrow.amount;
        
        // Update contract state
        totalEscrowedAmount -= amount;
        totalActiveEscrows--;
        hasActiveEscrow[user] = false;
        
        escrow.isActive = false;
        escrow.amount = 0;

        token.safeTransfer(user, amount);
        
        emit EmergencyWithdrawal(msg.sender, user, amount, reason);
        emit TokensReleased(user, amount, block.timestamp, true);
        emit EscrowStateChanged(user, false, 0);
    }

    /**
     * @dev Emergency function to withdraw contract's token balance to owner
     * Only callable when paused and by emergency role
     */
    function emergencyTokenRecovery() external onlyEmergency whenPaused {
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No tokens to recover");
        
        token.safeTransfer(owner(), balance);
        emit EmergencyWithdrawal(msg.sender, owner(), balance, "Contract token recovery");
    }

    // Enhanced Admin functions for fee management

    /**
     * @dev Update fee basis points (admin only)
     * @param newFeeBasisPoints New fee in basis points
     */
    function updateFeeBasisPoints(uint256 newFeeBasisPoints) external onlyAdmin {
        require(newFeeBasisPoints <= MAX_FEE_BASIS_POINTS, "Fee exceeds maximum allowed");
        require(newFeeBasisPoints >= MIN_FEE_BASIS_POINTS, "Fee cannot be negative");
        
        uint256 oldFeeBasisPoints = feeBasisPoints;
        feeBasisPoints = newFeeBasisPoints;
        
        emit FeeBasisPointsUpdated(oldFeeBasisPoints, newFeeBasisPoints);
        emit FeeParametersUpdated(
            newFeeBasisPoints, // Now emits raw basis points for clarity instead of percentage
            feeWallet, 
            msg.sender
        );
    }

    /**
     * @dev Update fee wallet address (admin only)
     * @param newFeeWallet New fee wallet address
     */
    function updateFeeWallet(address newFeeWallet) external onlyAdmin {
        require(newFeeWallet != address(0), "Fee wallet cannot be zero");
        
        address oldFeeWallet = feeWallet;
        feeWallet = newFeeWallet;
        
        emit FeeWalletUpdated(oldFeeWallet, newFeeWallet);
        emit FeeParametersUpdated(
            feeBasisPoints, // Now emits raw basis points for clarity instead of percentage
            newFeeWallet, 
            msg.sender
        );
    }

    /**
     * @dev Update voting period (admin only)
     * @param newVotingPeriod New voting period in seconds
     */
    function updateVotingPeriod(uint256 newVotingPeriod) external onlyAdmin {
        require(newVotingPeriod > 0, "Voting period must be greater than 0");
        
        uint256 oldVotingPeriod = votingPeriod;
        votingPeriod = newVotingPeriod;
        
        emit VotingPeriodUpdated(oldVotingPeriod, newVotingPeriod, msg.sender);
    }

    /**
     * @dev Set fee exemption for a user (admin only)
     * @param user The user address
     * @param isExempt Whether the user should be exempt from fees
     */
    function setFeeExemption(address user, bool isExempt) external onlyAdmin {
        require(user != address(0), "User address cannot be zero");
        
        feeExemptions[user] = isExempt;
        emit FeeExemptionUpdated(user, isExempt);
    }

    /**
     * @dev Batch set fee exemptions for multiple users (admin only)
     * @param users Array of user addresses
     * @param exemptions Array of exemption statuses
     */
    function batchSetFeeExemptions(address[] calldata users, bool[] calldata exemptions) 
        external 
        onlyAdmin 
    {
        require(users.length == exemptions.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < users.length; i++) {
            require(users[i] != address(0), "User address cannot be zero");
            feeExemptions[users[i]] = exemptions[i];
            emit FeeExemptionUpdated(users[i], exemptions[i]);
        }
    }

    // Role Management Functions

    /**
     * @dev Grant admin role to an address (only owner)
     * @param account The address to grant admin role to
     */
    function grantAdminRole(address account) external onlyOwner {
        grantRole(ADMIN_ROLE, account);
    }

    /**
     * @dev Revoke admin role from an address (only owner)
     * @param account The address to revoke admin role from
     */
    function revokeAdminRole(address account) external onlyOwner {
        revokeRole(ADMIN_ROLE, account);
    }

    /**
     * @dev Grant emergency role to an address (only owner)
     * @param account The address to grant emergency role to
     */
    function grantEmergencyRole(address account) external onlyOwner {
        grantRole(EMERGENCY_ROLE, account);
    }

    /**
     * @dev Revoke emergency role from an address (only owner)
     * @param account The address to revoke emergency role from
     */
    function revokeEmergencyRole(address account) external onlyOwner {
        revokeRole(EMERGENCY_ROLE, account);
    }

    // Enhanced View functions for contract transparency

    /**
     * @dev Get comprehensive contract state information
     * @return totalEscrowed Total amount currently escrowed
     * @return totalFees Total fees collected since deployment
     * @return activeEscrows Number of currently active escrows
     * @return contractBalance Current token balance of the contract
     * @return isPaused Whether the contract is currently paused
     */
    function getContractState() 
        external 
        view 
        returns (
            uint256 totalEscrowed,
            uint256 totalFees,
            uint256 activeEscrows,
            uint256 contractBalance,
            bool isPaused
        ) 
    {
        return (
            totalEscrowedAmount,
            totalFeesCollected,
            totalActiveEscrows,
            token.balanceOf(address(this)),
            paused()
        );
    }

    /**
     * @dev Get current fee information
     * @return currentFeeBasisPoints Current fee in basis points
     * @return maxFeeBasisPoints Maximum allowed fee in basis points
     * @return feeWalletAddress Current fee wallet address
     */
    function getFeeInfo() 
        external 
        view 
        returns (
            uint256 currentFeeBasisPoints, 
            uint256 maxFeeBasisPoints, 
            address feeWalletAddress
        ) 
    {
        return (feeBasisPoints, MAX_FEE_BASIS_POINTS, feeWallet);
    }

    /**
     * @dev Get detailed escrow information for a user
     * @param user The user address to query
     * @return isActive Whether the user has an active escrow
     * @return amount Amount currently escrowed
     * @return depositTime When the escrow was created
     * @return releaseTime When the escrow can be released
     * @return feePaid Fee paid for this escrow
     * @return timeRemaining Time remaining until release (0 if can be released)
     */
    function getDetailedEscrowInfo(address user) 
        external 
        view 
        returns (
            bool isActive,
            uint256 amount,
            uint256 depositTime,
            uint256 releaseTime,
            uint256 feePaid,
            uint256 timeRemaining
        ) 
    {
        EscrowData memory escrow = escrows[user];
        return (
            escrow.isActive,
            escrow.amount,
            escrow.depositTimestamp,
            escrow.releaseTimestamp,
            escrow.feePaid,
            getRemainingVotingTime(user)
        );
    }

    /**
     * @dev Check if a user is fee exempt
     * @param user The user address to check
     * @return True if user is exempt from fees
     */
    function isFeeExempt(address user) external view returns (bool) {
        return feeExemptions[user];
    }

    /**
     * @dev Get fee paid for a specific escrow
     * @param user The user address
     * @return The fee amount paid for the escrow
     */
    function getEscrowFeePaid(address user) external view returns (uint256) {
        return escrows[user].feePaid;
    }

    /**
     * @dev Get role information for an address
     * @param account The address to check
     * @return hasAdminRole Whether the address has admin role
     * @return hasEmergencyRole Whether the address has emergency role
     * @return isOwner Whether the address is the contract owner
     */
    function getRoleInfo(address account) 
        external 
        view 
        returns (
            bool hasAdminRole,
            bool hasEmergencyRole,
            bool isOwner
        ) 
    {
        return (
            hasRole(ADMIN_ROLE, account),
            hasRole(EMERGENCY_ROLE, account),
            owner() == account
        );
    }

    /**
     * @dev Get voting period and timing information
     * @return currentVotingPeriod Current voting period in seconds
     * @return currentTimestamp Current block timestamp
     */
    function getTimingInfo() 
        external 
        view 
        returns (
            uint256 currentVotingPeriod,
            uint256 currentTimestamp
        ) 
    {
        return (votingPeriod, block.timestamp);
    }

    /**
     * @dev Simulate a vote cast (for front-end preview)
     * @param user The user who would cast the vote
     * @return canVote Whether the user can vote
     * @return votingPower The voting power available
     * @return timeRemaining Time remaining in voting period
     */
    function simulateVoteCast(address user, uint256 /* repositoryId */) 
        external 
        view 
        returns (
            bool canVote,
            uint256 votingPower,
            uint256 timeRemaining
        ) 
    {
        EscrowData memory escrow = escrows[user];
        return (
            escrow.isActive && isVotingPeriodActive(user),
            escrow.amount,
            getRemainingVotingTime(user)
        );
    }

    // Existing functions (updated to use new structure)

    // Enhanced View functions for contract transparency

    /**
     * @dev Get comprehensive contract state information
     */

    function calculateReleaseTimestamp(uint256 depositTime) internal view returns (uint256) {
        return depositTime + votingPeriod;
    }

    function isVotingPeriodActive(address user) public view returns (bool) {
        EscrowData memory escrow = escrows[user];
        return escrow.isActive && block.timestamp < escrow.releaseTimestamp;
    }

    function getRemainingVotingTime(address user) public view returns (uint256) {
        EscrowData memory escrow = escrows[user];
        if (!escrow.isActive || block.timestamp >= escrow.releaseTimestamp) {
            return 0;
        }
        return escrow.releaseTimestamp - block.timestamp;
    }

    function canReleaseTokens(address user) public view returns (bool) {
        EscrowData memory escrow = escrows[user];
        return escrow.isActive && block.timestamp >= escrow.releaseTimestamp;
    }

    function getEscrowDetails(address user) external view onlyAdmin returns (EscrowData memory) {
        return escrows[user];
    }

    function updateReleaseTimestamp(address user, uint256 newReleaseTimestamp) external onlyAdmin {
        require(escrows[user].isActive, "No active escrow for this user");
        require(newReleaseTimestamp > block.timestamp, "Release timestamp must be in the future");
        
        uint256 oldTimestamp = escrows[user].releaseTimestamp;
        escrows[user].releaseTimestamp = newReleaseTimestamp;
        
        emit VotingPeriodUpdated(oldTimestamp, newReleaseTimestamp, msg.sender);
    }

    // Legacy getter functions for backward compatibility

    /**
     * @dev Returns the address of the fee wallet.
     */
    function getFeeWallet() external view returns (address) {
        return feeWallet;
    }

    // Removed legacy getFeePercentage getter for clarity. Use getFeeInfo for raw basis points.
    // Rationale: getFeeInfo provides all fee details in basis points, which is the standard for smart contracts.

    /**
     * @dev Returns the address of the token being escrowed.
     */
    function getTokenAddress() external view returns (address) {
        return address(token);
    }

    /**
     * @dev Allows a user to cast a vote on a repository.
     * @param repositoryId The ID of the repository to vote on.
     * @param amount The amount of votes to cast.
     */
    function castVote(uint256 repositoryId, uint256 amount) external nonReentrant {
        EscrowData storage escrow = escrows[msg.sender];

        // Validate voting conditions
        require(escrow.isActive, "No active escrow");
        require(isVotingPeriodActive(msg.sender), "Voting period expired");
        require(amount > 0, "Vote amount must be greater than 0");
        require(escrow.votesCast + amount <= escrow.amount, "Insufficient vote balance");

        // Update vote tracking
        escrow.votesCast += amount;
        userVotesPerRepo[msg.sender][repositoryId] += amount;
        totalVotesPerRepo[repositoryId] += amount;

        // Emit voting event
        emit VoteCasted(msg.sender, repositoryId, amount);
    }

    /**
     * @dev Gets the remaining vote balance for a user.
     * @param user The address of the user.
     * @return The remaining vote balance.
     */
    function getRemainingVoteBalance(address user) external view returns (uint256) {
        EscrowData memory escrow = escrows[user];
        return escrow.amount - escrow.votesCast;
    }
}