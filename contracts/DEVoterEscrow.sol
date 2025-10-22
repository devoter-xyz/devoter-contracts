// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title DEVoterEscrow
 * @dev This contract manages the escrow of DEV tokens for voting purposes within the DEVoter ecosystem.
 * Users can deposit tokens, which are then locked for a specified voting period.
 * During this period, the escrowed tokens can be used to cast votes on various proposals or repositories.
 * After the voting period concludes, users can release their tokens.
 * The contract includes features for fee collection, emergency controls, and administrative functions
 * to manage parameters like fee percentages and voting periods.
 *
 * Inherits:
 * - `ReentrancyGuard`: Prevents reentrant calls to critical functions.
 * - `Ownable`: Provides a basic access control mechanism where a single address (the owner) has exclusive access to certain functions.
 * - `Pausable`: Allows the contract to be paused and unpaused, typically for emergency situations.
 * - `AccessControl`: A more granular role-based access control system.
 */
contract DEVoterEscrow is ReentrancyGuard, Ownable, Pausable, AccessControl {
    using SafeERC20 for IERC20;

    // Access Control Roles
    /**
     * @dev Role for administrators who can manage contract parameters like fees and voting periods.
     */
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    /**
     * @dev Role for emergency operators who can pause the contract or perform emergency withdrawals.
     */
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    /**
     * @dev Role specifically granted to the DEVoterVoting contract to interact with escrowed tokens.
     */
    bytes32 public constant VOTING_CONTRACT_ROLE = keccak256("VOTING_CONTRACT_ROLE");

    // Constants for fee calculation
    /**
     * @dev Denominator for basis point calculations. 10000 basis points = 100%.
     */
    uint256 public constant BASIS_POINTS_DENOMINATOR = 10000; // 100% = 10000 basis points
    /**
     * @dev Maximum allowed fee in basis points (e.g., 500 basis points = 5%).
     */
    uint256 public constant MAX_FEE_BASIS_POINTS = 500; // 5% maximum fee (500 basis points)
    /**
     * @dev Minimum allowed fee in basis points (e.g., 0 basis points = 0%).
     */
    uint256 public constant MIN_FEE_BASIS_POINTS = 0; // 0% minimum fee

    /**
     * @dev The ERC20 token contract being escrowed.
     */
    IERC20 public immutable token;
    /**
     * @dev Address where collected fees are sent.
     */
    address public feeWallet;
    /**
     * @dev Current fee percentage applied to deposits, in basis points (e.g., 100 = 1%).
     */
    uint256 public feeBasisPoints; // Fee in basis points (1 basis point = 0.01%)
    /**
     * @dev The duration in seconds for which tokens are locked and available for voting.
     */
    uint256 public votingPeriod;

    /**
     * @dev Mapping to track which users are exempt from paying fees.
     */
    mapping(address => bool) public feeExemptions;

    // Contract state tracking
    /**
     * @dev Total amount of tokens currently held in active escrows.
     */
    uint256 public totalEscrowedAmount;
    /**
     * @dev Total amount of fees collected since contract deployment.
     */
    uint256 public totalFeesCollected;
    /**
     * @dev Number of currently active escrows.
     */
    uint256 public totalActiveEscrows;
    /**
     * @dev Mapping to quickly check if a user has an active escrow.
     */
    mapping(address => bool) public hasActiveEscrow;

    /**
     * @dev Structure to hold detailed information about a user's escrow.
     * @param isActive True if the escrow is currently active.
     * @param amount The amount of tokens currently escrowed by the user.
     * @param depositTimestamp The timestamp when the tokens were deposited.
     * @param releaseTimestamp The timestamp when the escrowed tokens become releasable.
     * @param feePaid The fee amount paid for this specific escrow.
     * @param votesCast The total number of votes cast by the user using this escrow.
     */
    struct EscrowData {
        bool isActive;
        uint256 amount;
        uint256 depositTimestamp;
        uint256 releaseTimestamp;
        uint256 feePaid; // Track fee paid for this escrow
        uint256 votesCast; // Track total votes cast by the user
    }

    /**
     * @dev Mapping from user address to their `EscrowData`.
     */
    mapping(address => EscrowData) public escrows;


    // Comprehensive Events System
    /**
     * @dev Emitted when tokens are successfully escrowed.
     * @param user The address of the user who escrowed tokens.
     * @param escrowId A unique identifier for the escrow (derived from user address).
     * @param amount The amount of tokens escrowed.
     * @param releaseTime The timestamp when the escrowed tokens can be released.
     * @param votingPeriod The duration for which the tokens are locked for voting.
     */
    event TokensEscrowed(
        address indexed user, 
        uint256 indexed escrowId,
        uint256 amount, 
        uint256 releaseTime,
        uint256 votingPeriod
    );

    // Mappings for vote tracking
    /**
     * @dev Tracks the total votes cast by a user per repository.
     * Mapping: user address -> repository ID -> vote amount.
     */
    mapping(address => mapping(uint256 => uint256)) public userVotesPerRepo;
    /**
     * @dev Tracks the total votes cast across all users for a specific repository.
     * Mapping: repository ID -> total vote amount.
     */
    mapping(uint256 => uint256) public totalVotesPerRepo;

    /**
     * @dev The address of the DEVoterVoting contract, which interacts with this escrow for voting.
     */
    address public devoterVotingContractAddress; // New state variable


    /**
     * @dev Emitted when tokens are deposited into escrow.
     * @param user The address of the user making the deposit.
     * @param amount The total amount of tokens deposited (before fee deduction).
     * @param feePaid The amount of fee paid for this deposit.
     * @param amountEscrowed The net amount of tokens escrowed after fee deduction.
     * @param releaseTimestamp The timestamp when the escrowed tokens become releasable.
     */
    event TokensDeposited(
        address indexed user, 
        uint256 amount, 
        uint256 feePaid, 
        uint256 amountEscrowed, 
        uint256 releaseTimestamp
    );
    /**
     * @dev Emitted when escrowed tokens are released to the user.
     * @param user The address of the user whose tokens are released.
     * @param amount The amount of tokens released.
     * @param releaseTime The timestamp of the release.
     * @param wasForced True if the release was initiated by an admin (forced release).
     */
    event TokensReleased(
        address indexed user, 
        uint256 amount,
        uint256 releaseTime,
        bool wasForced
    );
    // Removed unused VoteCast event. Only VoteCasted is used for voting actions.
    // Rationale: Only one event is needed for vote actions to avoid confusion and redundancy.
    /**
     * @dev Emitted when fee parameters are updated.
     * @param newFeePercentage The new fee in basis points.
     * @param newFeeCollector The new address of the fee wallet.
     * @param updatedBy The address of the account that updated the parameters.
     */
    event FeeParametersUpdated(
        uint256 newFeePercentage, 
        address indexed newFeeCollector,
        address indexed updatedBy
    );
    /**
     * @dev Emitted during an emergency withdrawal of user funds.
     * @param admin The address of the emergency role account performing the withdrawal.
     * @param user The address of the user whose tokens were withdrawn.
     * @param amount The amount of tokens withdrawn.
     * @param reason The reason provided for the emergency withdrawal.
     */
    event EmergencyWithdrawal(
        address indexed admin, 
        address indexed user, 
        uint256 amount,
        string reason
    );
    /**
     * @dev Emitted when the fee basis points are updated.
     * @param oldFeeBasisPoints The previous fee in basis points.
     * @param newFeeBasisPoints The new fee in basis points.
     */
    event FeeBasisPointsUpdated(uint256 oldFeeBasisPoints, uint256 newFeeBasisPoints);
    /**
     * @dev Emitted when the fee wallet address is updated.
     * @param oldFeeWallet The previous fee wallet address.
     * @param newFeeWallet The new fee wallet address.
     */
    event FeeWalletUpdated(address indexed oldFeeWallet, address indexed newFeeWallet);
    /**
     * @dev Emitted when a user's fee exemption status is updated.
     * @param user The address of the user whose exemption status changed.
     * @param isExempt True if the user is now exempt, false otherwise.
     */
    event FeeExemptionUpdated(address indexed user, bool isExempt);
    /**
     * @dev Emitted when fees are collected from a deposit.
     * @param user The address of the user from whom the fee was collected.
     * @param feeAmount The amount of fee collected.
     */
    event FeeCollected(address indexed user, uint256 feeAmount);
    /**
     * @dev Emitted when tokens are forcibly released by an administrator.
     * @param user The address of the user whose tokens were force-released.
     * @param amount The amount of tokens force-released.
     * @param releasedBy The address of the administrator who initiated the force release.
     */
    event TokensForceReleased(address indexed user, uint256 amount, address indexed releasedBy);

    /**
     * @dev Emitted when the contract is paused.
     * @param admin The address of the account that paused the contract.
     * @param timestamp The timestamp when the contract was paused.
     */
    event ContractPaused(address indexed admin, uint256 timestamp);
    /**
     * @dev Emitted when the contract is unpaused.
     * @param admin The address of the account that unpaused the contract.
     * @param timestamp The timestamp when the contract was unpaused.
     */
    event ContractUnpaused(address indexed admin, uint256 timestamp);
    /**
     * @dev Emitted when a user's escrow state changes (e.g., activated, deactivated).
     * @param user The address of the user whose escrow state changed.
     * @param isActive True if the escrow is now active, false otherwise.
     * @param amount The current amount in the escrow.
     */
    event EscrowStateChanged(address indexed user, bool isActive, uint256 amount);
    /**
     * @dev Emitted when the voting period is updated.
     * @param oldPeriod The previous voting period in seconds.
     * @param newPeriod The new voting period in seconds.
     * @param updatedBy The address of the account that updated the voting period.
     */
    event VotingPeriodUpdated(uint256 oldPeriod, uint256 newPeriod, address indexed updatedBy);

    /**
     * @dev Emitted when a user's escrow release timestamp is updated by an admin.
     * @param user The address of the user whose release timestamp was updated.
     * @param oldReleaseTimestamp The previous release timestamp.
     * @param newReleaseTimestamp The new release timestamp.
     * @param updatedBy The address of the account that updated the release timestamp.
     */
    event ReleaseTimestampUpdated(
        address indexed user,
        uint256 oldReleaseTimestamp,
        uint256 newReleaseTimestamp,
        address indexed updatedBy
    );

    /**
     * @dev Emitted when a user successfully casts a vote.
     * @param user The address of the user who cast the vote.
     * @param repositoryId The ID of the repository on which the vote was cast.
     * @param amount The amount of vote tokens cast.
     */
    event VoteCasted(address indexed user, uint256 indexed repositoryId, uint256 amount);


    /**
     * @dev Initializes the DEVoterEscrow contract.
     * @param _tokenAddress The address of the ERC20 token to be used for escrow.
     * @param _feeWallet The address where collected fees will be sent.
     * @param _feeBasisPoints The initial fee percentage in basis points (e.g., 100 for 1%).
     * @param _votingPeriod The duration in seconds for which tokens are locked for voting.
     * @param initialOwner The address of the initial owner of the contract.
     */
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
    /**
     * @dev Throws if called by any account other than an admin or the contract owner.
     */
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender) || owner() == msg.sender, "Caller is not an admin");
        _;
    }

    /**
     * @dev Throws if called by any account other than an emergency role or the contract owner.
     */
    modifier onlyEmergency() {
        require(hasRole(EMERGENCY_ROLE, msg.sender) || owner() == msg.sender, "Caller does not have emergency role");
        _;
    }

    /**
     * @dev Throws if called by any account other than the designated DEVoterVoting contract.
     */
    modifier onlyVotingContract() {
        require(msg.sender == devoterVotingContractAddress, "Caller is not the DEVoterVoting contract");
        _;
    }

    /**
     * @dev Sets the address of the DEVoterVoting contract and grants it the `VOTING_CONTRACT_ROLE`.
     * This function can only be called by the contract owner.
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
     * @dev Calculates the fee amount based on the provided amount and user's fee exemption status.
     * @param amount The total amount for which the fee is to be calculated.
     * @param user The address of the user, used to check for fee exemptions.
     * @return calculatedFee The computed fee amount.
     */
    function calculateFee(uint256 amount, address user) public view returns (uint256 calculatedFee) {
        if (amount == 0) return 0;
        if (feeExemptions[user]) return 0;
        if (feeBasisPoints == 0) return 0;

        // Calculate fee using basis points for precision
        calculatedFee = (amount * feeBasisPoints) / BASIS_POINTS_DENOMINATOR;
        
        // Ensure fee doesn't exceed the amount
        if (calculatedFee > amount) {
            calculatedFee = amount;
        }
    }

    /**
     * @dev Calculates the net amount that will be escrowed after fee deduction.
     * @param amount The total amount of tokens intended for deposit.
     * @param user The address of the user, used to check for fee exemptions.
     * @return netEscrowAmount The amount of tokens that will be placed into escrow.
     * @return calculatedFee The amount of fee that will be charged.
     */
    function calculateEscrowAmount(uint256 amount, address user) 
        public 
        view 
        returns (uint256 netEscrowAmount, uint256 calculatedFee) 
    {
        calculatedFee = calculateFee(amount, user);
        netEscrowAmount = amount - calculatedFee;
    }

    /**
     * @dev Provides a preview of the fee calculation for a given amount and user.
     * @param amount The amount of tokens for which to preview the fee.
     * @param user The address of the user for whom to check fee exemption.
     * @return calculatedFee The fee amount that would be charged.
     * @return netEscrowAmount The net amount that would be escrowed after fee deduction.
     * @return isExempt Whether the user is currently exempt from fees.
     */
    function previewFee(uint256 amount, address user) 
        external 
        view 
        returns (
            uint256 calculatedFee, 
            uint256 netEscrowAmount, 
            bool isExempt
        ) 
    {
        isExempt = feeExemptions[user];
        calculatedFee = calculateFee(amount, user);
        netEscrowAmount = amount - calculatedFee;
    }

    /**
     * @dev Allows a user to deposit tokens into escrow. A fee may be deducted based on `feeBasisPoints`.
     * The deposited tokens are locked for the `votingPeriod` and can be used for voting.
     * Reverts if the deposit amount is zero or if the user already has an active escrow.
     * @param _amount The total amount of tokens the user wishes to deposit.
     */
    function deposit(uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount > 0, "Deposit amount must be greater than 0");
        require(!escrows[msg.sender].isActive, "User already has an active escrow");

        uint256 calculatedFee = calculateFee(_amount, msg.sender);
        uint256 netEscrowAmount = _amount - calculatedFee;

        token.safeTransferFrom(msg.sender, address(this), _amount);

        // Transfer fee if applicable
        if (calculatedFee > 0) {
            token.safeTransfer(feeWallet, calculatedFee);
            emit FeeCollected(msg.sender, calculatedFee);
        }

        // Update contract state
        totalEscrowedAmount += netEscrowAmount;
        totalFeesCollected += calculatedFee;
        totalActiveEscrows++;
        hasActiveEscrow[msg.sender] = true;

        uint256 releaseTimestamp = calculateReleaseTimestamp(block.timestamp);

        escrows[msg.sender] = EscrowData({
            isActive: true,
            amount: netEscrowAmount,
            depositTimestamp: block.timestamp,
            releaseTimestamp: releaseTimestamp,
            feePaid: calculatedFee,
            votesCast: 0
        });

        emit TokensDeposited(
            msg.sender, 
            _amount, 
            calculatedFee, 
            netEscrowAmount, 
            releaseTimestamp
        );

        emit TokensEscrowed(
            msg.sender,
            uint256(uint160(msg.sender)), // Using address as escrow ID
            netEscrowAmount,
            releaseTimestamp,
            votingPeriod
        );

        emit EscrowStateChanged(msg.sender, true, netEscrowAmount);
    }


    /**
     * @dev Allows a user to release their escrowed tokens after the voting period has ended.
     * Reverts if there is no active escrow or if the voting period is not yet over.
     */
    function releaseTokens() external nonReentrant whenNotPausedOrEmergency {
        EscrowData storage escrow = escrows[msg.sender];
        require(escrow.isActive, "No active escrow for this user");
        require(block.timestamp >= escrow.releaseTimestamp, "Voting period is not over yet");

        uint256 escrowedAmount = escrow.amount;

        // Update contract state
        totalEscrowedAmount -= escrowedAmount;
        totalActiveEscrows--;
        hasActiveEscrow[msg.sender] = false;

        escrow.isActive = false;
        escrow.amount = 0;

        token.safeTransfer(msg.sender, escrowedAmount);

        emit TokensReleased(msg.sender, escrowedAmount, block.timestamp, false);
        emit EscrowStateChanged(msg.sender, false, 0);
    }

    /**
     * @dev Allows the contract owner to forcibly release tokens for a specific user.
     * This can be used in exceptional circumstances to bypass the voting period.
     * Reverts if the user does not have an active escrow.
     * @param user The address of the user whose tokens are to be released.
     */
    function forceReleaseTokens(address user) external onlyOwner nonReentrant {
        EscrowData storage escrow = escrows[user];
        require(escrow.isActive, "No active escrow for this user");

        uint256 escrowedAmount = escrow.amount;
        
        // Update contract state
        totalEscrowedAmount -= escrowedAmount;
        totalActiveEscrows--;
        hasActiveEscrow[user] = false;
        
        escrow.isActive = false;
        escrow.amount = 0;

        token.safeTransfer(user, escrowedAmount);

        emit TokensForceReleased(user, escrowedAmount, msg.sender);
        emit TokensReleased(user, escrowedAmount, block.timestamp, true);
        emit EscrowStateChanged(user, false, 0);
    }

    /**
     * @dev Allows the designated DEVoterVoting contract to return a specific amount of vote tokens to a user.
     * This function is typically called when a user's vote is no longer active or has been withdrawn from a proposal.
     * Reverts if the user has no active escrow, the amount is zero, or the amount exceeds the escrowed balance.
     * @param user The address of the user whose tokens are to be returned.
     * @param tokensToReturn The amount of tokens to return to the user.
     * @return True if the tokens were successfully returned.
     */
    function returnVoteTokens(address user, uint256 tokensToReturn) external onlyVotingContract nonReentrant returns (bool) {
        EscrowData storage escrow = escrows[user];
        require(escrow.isActive, "No active escrow for this user");
        require(tokensToReturn > 0, "Amount must be greater than 0");
        require(escrow.amount >= tokensToReturn, "Insufficient escrow balance for withdrawal");

        // Update escrowed amount
        // Adjust votesCast to maintain invariant votesCast <= amount
        escrow.votesCast = escrow.votesCast > tokensToReturn ? escrow.votesCast - tokensToReturn : 0;
        escrow.amount -= tokensToReturn;

        // If escrowed amount becomes 0, deactivate escrow
        if (escrow.amount == 0) {
            escrow.isActive = false;
            totalActiveEscrows--;
            hasActiveEscrow[user] = false;
        }

        totalEscrowedAmount -= tokensToReturn;
        token.safeTransfer(user, tokensToReturn);

        emit TokensReleased(user, tokensToReturn, block.timestamp, true); // Consider if a new event is needed
        emit EscrowStateChanged(user, escrow.isActive, escrow.amount);
        return true;
    }

    // Emergency Functions
    
    /**
     * @dev Pauses the contract, preventing most state-changing operations.
     * Only callable by an account with the `EMERGENCY_ROLE`.
     */
    function pauseContract() external onlyEmergency {
        _pause();
        emit ContractPaused(msg.sender, block.timestamp);
    }

    /**
     * @dev Unpauses the contract, allowing normal operations to resume.
     * Only callable by an account with the `EMERGENCY_ROLE`.
     */
    function unpauseContract() external onlyEmergency {
        _unpause();
        emit ContractUnpaused(msg.sender, block.timestamp);
    }

    /**
     * @dev Allows an emergency role to withdraw a user's entire escrowed amount.
     * This function is intended for critical situations to protect user funds.
     * Reverts if the user has no active escrow or if no reason is provided.
     * @param user The address of the user whose tokens should be emergency withdrawn.
     * @param reason A mandatory string explaining the reason for the emergency withdrawal.
     */
    function emergencyWithdraw(address user, string calldata reason) external onlyEmergency {
        EscrowData storage escrow = escrows[user];
        require(escrow.isActive, "No active escrow for this user");
        require(bytes(reason).length > 0, "Emergency reason required");

        uint256 escrowedAmount = escrow.amount;
        
        // Update contract state
        totalEscrowedAmount -= escrowedAmount;
        totalActiveEscrows--;
        hasActiveEscrow[user] = false;
        
        escrow.isActive = false;
        escrow.amount = 0;

        token.safeTransfer(user, escrowedAmount);
        
        emit EmergencyWithdrawal(msg.sender, user, escrowedAmount, reason);
        emit TokensReleased(user, escrowedAmount, block.timestamp, true);
        emit EscrowStateChanged(user, false, 0);
    }

    /**
     * @dev Allows an emergency role to recover tokens accidentally sent to the contract.
     * This function distinguishes between the primary escrow token and other (foreign) tokens.
     * For the primary escrow token, it only allows recovery of surplus tokens beyond the total escrowed amount.
     * For foreign tokens, it allows recovery of the entire balance of that token.
     * Only callable when the contract is paused.
     * @param recoverToken The address of the IERC20 token to recover.
     */
    function emergencyTokenRecovery(IERC20 recoverToken) external onlyEmergency whenPaused {
        require(address(recoverToken) != address(0), "Zero token");
        if (address(recoverToken) == address(token)) {
            uint256 bal = token.balanceOf(address(this));
            require(bal > totalEscrowedAmount, "No surplus escrow token to recover");
            uint256 surplus = bal - totalEscrowedAmount;
            token.safeTransfer(owner(), surplus);
            emit EmergencyWithdrawal(msg.sender, owner(), surplus, "Recover surplus escrow token");
        } else {
            uint256 bal = recoverToken.balanceOf(address(this));
            require(bal > 0, "No tokens to recover");
            SafeERC20.safeTransfer(recoverToken, owner(), bal);
            emit EmergencyWithdrawal(msg.sender, owner(), bal, "Recover foreign token");
        }
    }

    // Enhanced Admin functions for fee management

    /**
     * @dev Updates the fee basis points for new deposits.
     * Only callable by an account with the `ADMIN_ROLE`.
     * Reverts if the new fee basis points exceed the maximum or are below the minimum allowed.
     * @param newFeeBasisPoints The new fee percentage in basis points (e.g., 100 for 1%).
     */
    function updateFeeBasisPoints(uint256 newFeeBasisPoints) external onlyAdmin {
        require(newFeeBasisPoints <= MAX_FEE_BASIS_POINTS, "Fee exceeds maximum allowed");
        require(newFeeBasisPoints >= MIN_FEE_BASIS_POINTS, "Fee cannot be negative");
        
        uint256 oldFeeBasisPoints = feeBasisPoints;
        feeBasisPoints = newFeeBasisPoints;
        
        emit FeeBasisPointsUpdated(oldFeeBasisPoints, newFeeBasisPoints);
        emit FeeParametersUpdated(
            newFeeBasisPoints, 
            feeWallet, 
            msg.sender
        );
    }

    /**
     * @dev Updates the address of the fee wallet where collected fees are sent.
     * Only callable by an account with the `ADMIN_ROLE`.
     * Reverts if the new fee wallet address is zero.
     * @param newFeeWallet The new address for the fee wallet.
     */
    function updateFeeWallet(address newFeeWallet) external onlyAdmin {
        require(newFeeWallet != address(0), "Fee wallet cannot be zero");
        
        address oldFeeWallet = feeWallet;
        feeWallet = newFeeWallet;
        
        emit FeeWalletUpdated(oldFeeWallet, newFeeWallet);
        emit FeeParametersUpdated(
            feeBasisPoints, 
            newFeeWallet, 
            msg.sender
        );
    }

    /**
     * @dev Updates the duration of the voting period for new escrows.
     * Only callable by an account with the `ADMIN_ROLE`.
     * Reverts if the new voting period is zero.
     * @param newVotingPeriod The new voting period duration in seconds.
     */
    function updateVotingPeriod(uint256 newVotingPeriod) external onlyAdmin {
        require(newVotingPeriod > 0, "Voting period must be greater than 0");
        
        uint256 oldVotingPeriod = votingPeriod;
        votingPeriod = newVotingPeriod;
        
        emit VotingPeriodUpdated(oldVotingPeriod, newVotingPeriod, msg.sender);
    }

    /**
     * @dev Sets or unsets fee exemption for a specific user.
     * Only callable by an account with the `ADMIN_ROLE`.
     * Reverts if the user address is zero.
     * @param user The address of the user to modify fee exemption status.
     * @param isExempt A boolean indicating whether the user should be exempt (true) or not (false).
     */
    function setFeeExemption(address user, bool isExempt) external onlyAdmin {
        require(user != address(0), "User address cannot be zero");
        
        feeExemptions[user] = isExempt;
        emit FeeExemptionUpdated(user, isExempt);
    }

    /**
     * @dev Allows an administrator to set fee exemptions for multiple users in a single transaction.
     * Only callable by an account with the `ADMIN_ROLE`.
     * Reverts if the lengths of the `users` and `exemptions` arrays do not match, or if any user address is zero.
     * @param users An array of user addresses to modify.
     * @param exemptions An array of boolean values, where each value corresponds to the exemption status for the user at the same index.
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
     * @dev Grants the `ADMIN_ROLE` to a specified account.
     * Only callable by the contract owner.
     * @param account The address to which the `ADMIN_ROLE` will be granted.
     */
    function grantAdminRole(address account) external onlyOwner {
        grantRole(ADMIN_ROLE, account);
    }

    /**
     * @dev Revokes the `ADMIN_ROLE` from a specified account.
     * Only callable by the contract owner.
     * @param account The address from which the `ADMIN_ROLE` will be revoked.
     */
    function revokeAdminRole(address account) external onlyOwner {
        revokeRole(ADMIN_ROLE, account);
    }

    /**
     * @dev Grants the `EMERGENCY_ROLE` to a specified account.
     * Only callable by the contract owner.
     * @param account The address to which the `EMERGENCY_ROLE` will be granted.
     */
    function grantEmergencyRole(address account) external onlyOwner {
        grantRole(EMERGENCY_ROLE, account);
    }

    /**
     * @dev Revokes the `EMERGENCY_ROLE` from a specified account.
     * Only callable by the contract owner.
     * @param account The address from which the `EMERGENCY_ROLE` will be revoked.
     */
    function revokeEmergencyRole(address account) external onlyOwner {
        revokeRole(EMERGENCY_ROLE, account);
    }

    // Enhanced View functions for contract transparency

    /**
     * @dev Retrieves comprehensive state information about the contract.
     * @return totalEscrowedAmount_ Total amount of tokens currently held in active escrows.
     * @return totalFeesCollected_ Total amount of fees collected since contract deployment.
     * @return totalActiveEscrows_ Number of currently active escrows.
     * @return contractTokenBalance Current token balance of the contract address.
     * @return isContractPaused Whether the contract is currently paused.
     */
    function getContractState() 
        external 
        view 
        returns (
            uint256 totalEscrowedAmount_,
            uint256 totalFeesCollected_,
            uint256 totalActiveEscrows_,
            uint256 contractTokenBalance,
            bool isContractPaused
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
     * @dev Retrieves current fee-related information.
     * @return currentFeeBasisPoints_ Current fee percentage in basis points.
     * @return maxFeeBasisPoints_ Maximum allowed fee percentage in basis points.
     * @return feeWalletAddress_ Current address designated to receive fees.
     */
    function getFeeInfo() 
        external 
        view 
        returns (
            uint256 currentFeeBasisPoints_, 
            uint256 maxFeeBasisPoints_, 
            address feeWalletAddress_
        ) 
    {
        return (feeBasisPoints, MAX_FEE_BASIS_POINTS, feeWallet);
    }

    /**
     * @dev Retrieves detailed escrow information for a specific user.
     * @param user The address of the user to query.
     * @return isActive_ True if the user has an active escrow.
     * @return amount_ The amount of tokens currently escrowed by the user.
     * @return depositTime_ The timestamp when the user's tokens were deposited.
     * @return releaseTime_ The timestamp when the user's escrowed tokens become releasable.
     * @return feePaid_ The fee amount paid for this specific escrow.
     * @return timeRemaining_ The time remaining in seconds until the escrow can be released (0 if already releasable).
     */
    function getDetailedEscrowInfo(address user) 
        external 
        view 
        returns (
            bool isActive_,
            uint256 amount_,
            uint256 depositTime_,
            uint256 releaseTime_,
            uint256 feePaid_,
            uint256 timeRemaining_
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
     * @dev Checks if a specific user is exempt from paying deposit fees.
     * @param user The address of the user to check.
     * @return True if the user is fee exempt, false otherwise.
     */
    function isFeeExempt(address user) external view returns (bool) {
        return feeExemptions[user];
    }

    /**
     * @dev Retrieves the fee amount paid for a specific user's active escrow.
     * @param user The address of the user.
     * @return The fee amount paid for the user's escrow.
     */
    function getEscrowFeePaid(address user) external view returns (uint256) {
        return escrows[user].feePaid;
    }

    /**
     * @dev Retrieves the role information for a given account.
     * @param account The address to check for roles.
     * @return hasAdminRole_ True if the account has the `ADMIN_ROLE`.
     * @return hasEmergencyRole_ True if the account has the `EMERGENCY_ROLE`.
     * @return isOwner_ True if the account is the contract owner.
     */
    function getRoleInfo(address account) 
        external 
        view 
        returns (
            bool hasAdminRole_,
            bool hasEmergencyRole_,
            bool isOwner_
        ) 
    {
        return (
            hasRole(ADMIN_ROLE, account),
            hasRole(EMERGENCY_ROLE, account),
            owner() == account
        );
    }

    /**
     * @dev Retrieves the current voting period and the current block timestamp.
     * @return currentVotingPeriod_ The current voting period duration in seconds.
     * @return currentTimestamp_ The current block timestamp.
     */
    function getTimingInfo() 
        external 
        view 
        returns (
            uint256 currentVotingPeriod_,
            uint256 currentTimestamp_
        ) 
    {
        return (votingPeriod, block.timestamp);
    }

    /**
     * @dev Simulates a vote cast for a user to preview their voting capabilities.
     * This function does not alter contract state.
     * @param user The address of the user who would cast the vote.
     * @return canUserVote True if the user can currently cast a vote.
     * @return availableVotingPower The amount of voting power the user currently has.
     * @return remainingVotingTime Time remaining in seconds until the voting period ends for the user's escrow.
     */
    function simulateVoteCast(address user, uint256 /* repositoryId */) 
        external 
        view 
        returns (
            bool canUserVote,
            uint256 availableVotingPower,
            uint256 remainingVotingTime
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
     * @dev Calculates the release timestamp for an escrow based on the deposit time and voting period.
     * @param depositTime The timestamp when the tokens were deposited.
     * @return The calculated timestamp when the escrowed tokens become releasable.
     */
    function calculateReleaseTimestamp(uint256 depositTime) internal view returns (uint256) {
        return depositTime + votingPeriod;
    }

    /**
     * @dev Checks if a user's voting period is currently active.
     * @param user The address of the user to check.
     * @return True if the user has an active escrow and the current block timestamp is before the release timestamp.
     */
    function isVotingPeriodActive(address user) public view returns (bool) {
        EscrowData memory escrow = escrows[user];
        return escrow.isActive && block.timestamp < escrow.releaseTimestamp;
    }

    /**
     * @dev Retrieves the remaining time in seconds until a user's escrow can be released.
     * @param user The address of the user to check.
     * @return The remaining time in seconds, or 0 if the escrow is not active or the voting period has ended.
     */
    function getRemainingVotingTime(address user) public view returns (uint256) {
        EscrowData memory escrow = escrows[user];
        if (!escrow.isActive || block.timestamp >= escrow.releaseTimestamp) {
            return 0;
        }
        return escrow.releaseTimestamp - block.timestamp;
    }

    /**
     * @dev Checks if a user's escrowed tokens are currently releasable.
     * @param user The address of the user to check.
     * @return True if the user has an active escrow and the current block timestamp is on or after the release timestamp.
     */
    function canReleaseTokens(address user) public view returns (bool) {
        EscrowData memory escrow = escrows[user];
        return escrow.isActive && block.timestamp >= escrow.releaseTimestamp;
    }

    /**
     * @dev Retrieves the full `EscrowData` struct for a specific user.
     * Only callable by an account with the `ADMIN_ROLE`.
     * @param user The address of the user to query.
     * @return The `EscrowData` struct containing all details of the user's escrow.
     */
    function getEscrowDetails(address user) external view onlyAdmin returns (EscrowData memory) {
        return escrows[user];
    }

    /**
     * @dev Allows an administrator to update the release timestamp for a user's active escrow.
     * This can be used to extend or shorten the voting period in exceptional circumstances.
     * Only callable by an account with the `ADMIN_ROLE`.
     * Reverts if the user has no active escrow or if the new release timestamp is not in the future.
     * @param user The address of the user whose escrow release timestamp is to be updated.
     * @param newReleaseTimestamp The new timestamp in seconds when the escrowed tokens will become releasable.
     */
    function updateReleaseTimestamp(address user, uint256 newReleaseTimestamp) external onlyAdmin {
        require(escrows[user].isActive, "No active escrow for this user");
        require(newReleaseTimestamp > block.timestamp, "Release timestamp must be in the future");
        
        uint256 previousReleaseTimestamp = escrows[user].releaseTimestamp;
        escrows[user].releaseTimestamp = newReleaseTimestamp;
        
        emit ReleaseTimestampUpdated(user, previousReleaseTimestamp, newReleaseTimestamp, msg.sender);
    }

    // Legacy getter functions for backward compatibility

    /**
     * @dev Returns the address of the fee wallet.
     * @return The address of the fee wallet.
     */
    function getFeeWallet() external view returns (address) {
        return feeWallet;
    }

    // Removed legacy getFeePercentage getter for clarity. Use getFeeInfo for raw basis points.
    // Rationale: getFeeInfo provides all fee details in basis points, which is the standard for smart contracts.

    /**
     * @dev Returns the address of the ERC20 token being escrowed.
     * @return The address of the token contract.
     */
    function getTokenAddress() external view returns (address) {
        return address(token);
    }

    /**
     * @dev Allows a user to cast a vote on a specific repository using their escrowed tokens.
     * Reverts if the user has no active escrow, the voting period has expired, the vote amount is zero,
     * or if the user has insufficient remaining vote balance.
     * @param repositoryId The unique identifier of the repository to vote on.
     * @param voteAmount The amount of escrowed tokens to cast as a vote.
     */
    function castVote(uint256 repositoryId, uint256 voteAmount) external nonReentrant {
        EscrowData storage escrow = escrows[msg.sender];

        // Validate voting conditions
        require(escrow.isActive, "No active escrow");
        require(isVotingPeriodActive(msg.sender), "Voting period expired");
        require(voteAmount > 0, "Vote amount must be greater than 0");
        require(escrow.votesCast + voteAmount <= escrow.amount, "Insufficient vote balance");

        // Update vote tracking
        escrow.votesCast += voteAmount;
        userVotesPerRepo[msg.sender][repositoryId] += voteAmount;
        totalVotesPerRepo[repositoryId] += voteAmount;

        // Emit voting event
        emit VoteCasted(msg.sender, repositoryId, voteAmount);
    }

    /**
     * @dev Retrieves the remaining vote balance for a specific user.
     * This is the amount of escrowed tokens a user can still use to cast votes.
     * @param user The address of the user to query.
     * @return The remaining vote balance for the user.
     */
    function getRemainingVoteBalance(address user) external view returns (uint256) {
        EscrowData memory escrow = escrows[user];
        return escrow.amount - escrow.votesCast;
    }
}