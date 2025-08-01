// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DEVoterEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

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

    struct EscrowData {
        bool isActive;
        uint256 amount;
        uint256 depositTimestamp;
        uint256 releaseTimestamp;
        uint256 feePaid; // Track fee paid for this escrow
        uint256 votesCast; // Track total votes cast by the user
    }

    mapping(address => EscrowData) public escrows;

    // Mappings for vote tracking
    mapping(address => mapping(uint256 => uint256)) public userVotesPerRepo;
    mapping(uint256 => uint256) public totalVotesPerRepo;

    // Events
    event TokensDeposited(
        address indexed user, 
        uint256 amount, 
        uint256 feePaid, 
        uint256 amountEscrowed, 
        uint256 releaseTimestamp
    );
    event FeeBasisPointsUpdated(uint256 oldFeeBasisPoints, uint256 newFeeBasisPoints);
    event FeeWalletUpdated(address indexed oldFeeWallet, address indexed newFeeWallet);
    event FeeExemptionUpdated(address indexed user, bool isExempt);
    event FeeCollected(address indexed user, uint256 feeAmount);
    event TokensReleased(address indexed user, uint256 amount);
    event TokensForceReleased(address indexed user, uint256 amount, address indexed releasedBy);
    event VoteCasted(address indexed user, uint256 indexed repositoryId, uint256 amount);

    constructor(
        address _tokenAddress,
        address _feeWallet,
        uint256 _feeBasisPoints,
        uint256 _votingPeriod,
        address initialOwner
    ) Ownable() {
        require(_tokenAddress != address(0), "Token address cannot be zero");
        require(_feeWallet != address(0), "Fee wallet cannot be zero");
        require(_feeBasisPoints <= MAX_FEE_BASIS_POINTS, "Fee exceeds maximum allowed");
        require(_votingPeriod > 0, "Voting period must be greater than 0");

        token = IERC20(_tokenAddress);
        feeWallet = _feeWallet;
        feeBasisPoints = _feeBasisPoints;
        votingPeriod = _votingPeriod;
        _transferOwnership(initialOwner);
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
    function deposit(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Deposit amount must be greater than 0");
        require(!escrows[msg.sender].isActive, "User already has an active escrow");

        uint256 feeAmount = calculateFee(_amount, msg.sender);
        uint256 escrowedAmount = _amount - feeAmount;

        require(token.transferFrom(msg.sender, address(this), _amount), "Token transfer failed");
        
        // Transfer fee if applicable
        if (feeAmount > 0) {
            require(token.transfer(feeWallet, feeAmount), "Fee transfer failed");
            emit FeeCollected(msg.sender, feeAmount);
        }

        escrows[msg.sender] = EscrowData({
            isActive: true,
            amount: escrowedAmount,
            depositTimestamp: block.timestamp,
            releaseTimestamp: calculateReleaseTimestamp(block.timestamp),
            feePaid: feeAmount,
            votesCast: 0
        });

        emit TokensDeposited(
            msg.sender, 
            _amount, 
            feeAmount, 
            escrowedAmount, 
            escrows[msg.sender].releaseTimestamp
        );
    }

    /**
     * @dev Release escrowed tokens
     */
    function release() external nonReentrant {
        EscrowData storage escrow = escrows[msg.sender];
        require(escrow.isActive, "No active escrow for this user");
        require(block.timestamp >= escrow.releaseTimestamp, "Voting period is not over yet");

        uint256 amountToRelease = escrow.amount;
        escrow.isActive = false;
        escrow.amount = 0;

        require(token.transfer(msg.sender, amountToRelease), "Token release failed");
    }

    /**
     * @dev Allows a user to release their own tokens after the voting period.
     */
    function releaseTokens() external nonReentrant {
        EscrowData storage escrow = escrows[msg.sender];
        require(escrow.isActive, "No active escrow for this user");
        require(
            block.timestamp >= escrow.releaseTimestamp,
            "Cannot release tokens before the release timestamp"
        );

        uint256 amount = escrow.amount;
        escrow.isActive = false;
        escrow.amount = 0;

        token.safeTransfer(msg.sender, amount);

        emit TokensReleased(msg.sender, amount);
    }

    /**
     * @dev Allows the owner to forcibly release tokens for a user.
     * @param user The address of the user whose tokens are to be released.
     */
    function forceReleaseTokens(address user) external onlyOwner nonReentrant {
        EscrowData storage escrow = escrows[user];
        require(escrow.isActive, "No active escrow for this user");

        uint256 amount = escrow.amount;
        escrow.isActive = false;
        escrow.amount = 0;

        token.safeTransfer(user, amount);

        emit TokensForceReleased(user, amount, msg.sender);
    }

    // Admin functions for fee management

    /**
     * @dev Update fee basis points (admin only)
     * @param newFeeBasisPoints New fee in basis points
     */
    function updateFeeBasisPoints(uint256 newFeeBasisPoints) external onlyOwner {
        require(newFeeBasisPoints <= MAX_FEE_BASIS_POINTS, "Fee exceeds maximum allowed");
        require(newFeeBasisPoints >= MIN_FEE_BASIS_POINTS, "Fee cannot be negative");
        
        uint256 oldFeeBasisPoints = feeBasisPoints;
        feeBasisPoints = newFeeBasisPoints;
        
        emit FeeBasisPointsUpdated(oldFeeBasisPoints, newFeeBasisPoints);
    }

    /**
     * @dev Update fee wallet address (admin only)
     * @param newFeeWallet New fee wallet address
     */
    function updateFeeWallet(address newFeeWallet) external onlyOwner {
        require(newFeeWallet != address(0), "Fee wallet cannot be zero");
        
        address oldFeeWallet = feeWallet;
        feeWallet = newFeeWallet;
        
        emit FeeWalletUpdated(oldFeeWallet, newFeeWallet);
    }

    /**
     * @dev Set fee exemption for a user (admin only)
     * @param user The user address
     * @param isExempt Whether the user should be exempt from fees
     */
    function setFeeExemption(address user, bool isExempt) external onlyOwner {
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
        onlyOwner 
    {
        require(users.length == exemptions.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < users.length; i++) {
            require(users[i] != address(0), "User address cannot be zero");
            feeExemptions[users[i]] = exemptions[i];
            emit FeeExemptionUpdated(users[i], exemptions[i]);
        }
    }

    // View functions

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

    // Existing functions (updated to use new structure)

    function calculateReleaseTimestamp(uint256 depositTime) internal view returns (uint256) {
        return depositTime + votingPeriod;
    }

    function isVotingPeriodActive(address user) public view returns (bool) {
        EscrowData memory escrow = escrows[user];
        return escrow.isActive && block.timestamp < escrow.releaseTimestamp;
    }

    function getRemainingVotingTime(address user) external view returns (uint256) {
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

    function getEscrowDetails(address user) external view onlyOwner returns (EscrowData memory) {
        return escrows[user];
    }

    function updateReleaseTimestamp(address user, uint256 newReleaseTimestamp) external onlyOwner {
        require(escrows[user].isActive, "No active escrow for this user");
        escrows[user].releaseTimestamp = newReleaseTimestamp;
    }

    // Legacy getter functions for backward compatibility
    function getFeeWallet() external view returns (address) {
        return feeWallet;
    }

    function getFeePercentage() external view returns (uint256) {
        // Convert basis points to percentage for backward compatibility
        return (feeBasisPoints * 100) / BASIS_POINTS_DENOMINATOR;
    }

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