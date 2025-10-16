// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract RepositoryRegistry is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
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

    // === Fee System ===
    IERC20 public immutable token;
    address public feeWallet;
    uint256 public submissionFee;

    // Events
    event RepositorySubmitted(uint256 indexed id, address indexed maintainer, uint256 feePaid);
    event RepositoryUpdated(uint256 indexed id, address indexed maintainer, uint256 newDescriptionLength);
    event RepositoryDeactivated(uint256 indexed id);
    event SubmissionFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeWalletUpdated(address oldWallet, address newWallet);

    constructor(address initialOwner, address _token, address _feeWallet, uint256 _submissionFee) Ownable(initialOwner) {
        require(_token != address(0), "Token address cannot be zero");
        require(_feeWallet != address(0), "Fee wallet cannot be zero");
        token = IERC20(_token);
        feeWallet = _feeWallet;
        submissionFee = _submissionFee;
        repoCounter = 0;
    }
    

    /**
     * @dev Update repository description by the original maintainer
     * @param id Repository ID to update
     * @param newDescription New description for the repository
     */
    function updateRepository(uint256 id, string calldata newDescription) external nonReentrant {
    Repository storage repo = repositories[id];
    require(repo.maintainer != address(0), "Repository does not exist");
    require(repo.maintainer == msg.sender, "Not owner");
    require(repo.isActive, "Inactive");
        
    require(bytes(newDescription).length > 0, "Description cannot be empty");
    require(bytes(newDescription).length <= 1000, "Description too long");
    repo.description = newDescription;
    emit RepositoryUpdated(id, msg.sender, bytes(newDescription).length);
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
    ) external nonReentrant returns (uint256) {
        // Validate input parameters
        require(bytes(name).length > 0, "Repository name cannot be empty");
        require(bytes(url).length > 0, "Repository URL cannot be empty");
        require(tags.length > 0, "Tags are required");

        // Check for duplicate repository name
        for (uint256 i = 1; i <= repoCounter; i++) {
            if (repositories[i].maintainer != address(0)) {
                if (keccak256(abi.encodePacked(repositories[i].name)) == keccak256(abi.encodePacked(name))) {
                    revert("Repository name already exists");
                }
                if (keccak256(abi.encodePacked(repositories[i].githubUrl)) == keccak256(abi.encodePacked(url))) {
                    revert("Repository URL already exists");
                }
            }
        }

        // Check for duplicate tags
        for (uint256 i = 0; i < tags.length; i++) {
            for (uint256 j = i + 1; j < tags.length; j++) {
                if (keccak256(abi.encodePacked(tags[i])) == keccak256(abi.encodePacked(tags[j]))) {
                    revert("Duplicate tags are not allowed");
                }
            }
        }

        // Transfer submission fee only when configured
        if (submissionFee > 0) {
            token.safeTransferFrom(msg.sender, feeWallet, submissionFee);
        }

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
        emit RepositorySubmitted(repoCounter, msg.sender, submissionFee);
        return repoCounter;
    }

    // === Admin Functions ===
    function setSubmissionFee(uint256 newFee) external onlyOwner {
        emit SubmissionFeeUpdated(submissionFee, newFee);
        submissionFee = newFee;
    }

    function setFeeWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Fee wallet cannot be zero");
        emit FeeWalletUpdated(feeWallet, newWallet);
        feeWallet = newWallet;
    }

    /**
     * @dev Deactivates a repository by setting isActive to false
     * @param id The ID of the repository to deactivate
     * @notice Only the repository maintainer or contract owner can deactivate a repository
     */
    function deactivateRepository(uint256 id) external nonReentrant {
        Repository storage repo = repositories[id];
        // Check if repository exists by verifying maintainer is not zero address
        // (uninitialized mappings return default values, so address defaults to 0x0)
        require(repo.maintainer != address(0), "Repository does not exist");
        require(repo.maintainer == msg.sender || owner() == msg.sender, "No rights");
        require(repo.isActive, "Repository already inactive");
        
        repo.isActive = false;
        emit RepositoryDeactivated(id);
    }

    // ===== QUERY, SEARCH & FILTERING UTILITIES =====

    /**
     * @dev Get repository details by ID
     * @param id Repository ID to query
     * @return Repository struct containing all repository data
     */
    function getRepositoryDetails(uint256 id) external view returns (Repository memory) {
        return repositories[id];
    }

    /**
     * @dev Get active repositories with pagination
     * @param offset The starting index (0-based)
     * @param limit The maximum number of repositories to return
     * @return Array of Repository structs that are currently active
     */
    function getActiveRepositories(uint256 offset, uint256 limit) external view returns (Repository[] memory) {
        // Gather all active repositories
        uint256 activeCount = 0;
        for (uint256 i = 1; i <= repoCounter; i++) {
            if (repositories[i].isActive && repositories[i].maintainer != address(0)) {
                activeCount++;
            }
        }
        Repository[] memory tempRepos = new Repository[](activeCount);
        uint256 index = 0;
        for (uint256 i = 1; i <= repoCounter; i++) {
            if (repositories[i].isActive && repositories[i].maintainer != address(0)) {
                tempRepos[index] = repositories[i];
                index++;
            }
        }
        // Pagination
        if (offset >= activeCount) {
            return new Repository[](0);
        }
        uint256 end = offset + limit;
        if (end > activeCount) {
            end = activeCount;
        }
        Repository[] memory pagedRepos = new Repository[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            pagedRepos[i - offset] = tempRepos[i];
        }
        return pagedRepos;
    }

    /**
     * @dev Search repositories by tag (case-sensitive)
     * @param tag The tag to search for
     * @return Array of repository IDs that contain the specified tag
     */
    function searchByTag(string calldata tag) external view returns (uint256[] memory) {
        bytes32 tagHash = keccak256(abi.encodePacked(tag));
        uint256[] memory tempMatchingIds = new uint256[](repoCounter); // Max possible matches
        uint256 matchCount = 0;

        for (uint256 i = 1; i <= repoCounter; i++) {
            Repository storage repo = repositories[i];
            if (repo.maintainer != address(0) && repo.isActive) {
                for (uint256 j = 0; j < repo.tags.length; j++) {
                    if (keccak256(abi.encodePacked(repo.tags[j])) == tagHash) {
                        tempMatchingIds[matchCount] = i;
                        matchCount++;
                        break; // Found the tag, no need to check other tags for this repo
                    }
                }
            }
        }

        // Resize the array to the actual number of matches
        uint256[] memory matchingIds = new uint256[](matchCount);
        for (uint256 i = 0; i < matchCount; i++) {
            matchingIds[i] = tempMatchingIds[i];
        }

        return matchingIds;
    }

  

}
