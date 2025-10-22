import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";
import { DEVoterVoting } from "../typechain-types";
import { DEVoterEscrow } from "../typechain-types";
import { MockDEVToken } from "../typechain-types";
import { RepositoryRegistry } from "../typechain-types";

const DEVoterVotingABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_escrow",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_registry",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "initialOwner",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "requested",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "available",
        "type": "uint256"
      }
    ],
    "name": "InvalidWithdrawalAmount",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "currentTime",
        "type": "uint256"
      }
    ],
    "name": "WithdrawalDeadlinePassed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "reason",
        "type": "string"
      }
    ],
    "name": "WithdrawalNotAllowed",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "admin",
        "type": "address"
      }
    ],
    "name": "EmergencyWithdrawalExecuted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "EmergencyWithdrawalRequiresManualEscrowUpdate",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
                "name": "OwnerTransferred",    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "withdrawnAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "remainingAmount",
        "type": "uint256"
      }
    ],
    "name": "PartialWithdrawal",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "voter",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "name": "VoteCast",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "name": "VoteWithdrawn",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "endTime",
        "type": "uint256"
      }
    ],
    "name": "VotingPeriodEnded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "startTime",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "endTime",
        "type": "uint256"
      }
    ],
    "name": "VotingPeriodStarted",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "WITHDRAWAL_RESTRICTION_PERIOD",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      }
    ],
    "name": "canWithdrawVote",
    "outputs": [
      {
        "internalType": "bool",
        "name": "allowed",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "reason",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "castVote",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "emergencyWithdrawalOverride",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "endVotingPeriod",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "escrowContract",
    "outputs": [
      {
        "internalType": "contract DEVoterEscrow",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256[]",
        "name": "repositoryIds",
        "type": "uint256[]"
      }
    ],
    "name": "getBatchVotingResults",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "totalVotes",
        "type": "uint256[]"
      },
      {
        "internalType": "uint256[]",
        "name": "voterCounts",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "getEscrowBalanceAfterWithdrawal",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "projectedBalance",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      }
    ],
    "name": "getRemainingVotes",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "remaining",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      },
      {
        "internalType": "uint256[]",
        "name": "compareIds",
        "type": "uint256[]"
      }
    ],
    "name": "getRepositoryRank",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "rank",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      }
    ],
    "name": "getRepositoryStats",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "totalVotes",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "voterCount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "averageVoteAmount",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTimeUntilWithdrawalDeadline",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "timeRemaining",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256[]",
        "name": "repositoryIds",
        "type": "uint256[]"
      },
      {
        "internalType": "uint256",
        "name": "limit",
        "type": "uint256"
      }
    ],
    "name": "getTopRepositories",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "topIds",
        "type": "uint256[]"
      },
      {
        "internalType": "uint256[]",
        "name": "topVotes",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      }
    ],
    "name": "getTotalWithdrawnByUser",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "totalAmount",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      }
    ],
    "name": "getUserCurrentVoteAmount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "currentVoteAmount",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "getUserVoteCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "count",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      }
    ],
    "name": "getUserVoteForRepository",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "getUserVotes",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "repositoryIds",
        "type": "uint256[]"
      },
      {
        "internalType": "uint256[]",
        "name": "amounts",
        "type": "uint256[]"
      },
      {
        "internalType": "uint256[]",
        "name": "timestamps",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "getUserVotingPower",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "getUserWithdrawals",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "repositoryId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "isActive",
            "type": "bool"
          }
        ],
        "internalType": "struct DEVoterVoting.WithdrawalRecord[]",
        "name": "withdrawals",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      }
    ],
    "name": "getVotingResults",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "totalVotes",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "voterCount",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getVotingStatus",
    "outputs": [
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "remaining",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getWithdrawalDeadline",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "hasUserVoted",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      }
    ],
    "name": "hasUserVotedForRepository",
    "outputs": [
      {
        "internalType": "bool",
        "name": "hasVoted",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "isVotingActive",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "isWithinRestrictionPeriod",
    "outputs": [
      {
        "internalType": "bool",
        "name": "inRestrictionPeriod",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "timeUntilVotingEnds",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "registryContract",
    "outputs": [
      {
        "internalType": "contract RepositoryRegistry",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "remainingVotes",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "repositoryVotes",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "totalVotes",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "voterCount",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "duration",
        "type": "uint256"
      }
    ],
    "name": "startVotingPeriod",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "totalWithdrawn",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "userVotes",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "userVotesByRepository",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "userWithdrawals",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "repositoryId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "isActive",
            "type": "bool"
          }
        ],
        "internalType": "struct DEVoterVoting.WithdrawalRecord[]",
        "name": "withdrawals",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "validateVote",
    "outputs": [
      {
        "internalType": "bool",
        "name": "valid",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "error",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "votingEndTime",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "votingStartTime",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "repositoryId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "withdrawVoteWithErrorHandling",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];
const DEVoterVotingBytecode = "0x608060405234801561001057600080fd5b5060405161311a38038061311a83398101604081905261002f916101c1565b806001600160a01b03811661005f57604051631e4fbdf760e01b8152600060048201526024015b60405180910390fd5b61006881610155565b50600180556001600160a01b0383166100c35760405162461bcd60e51b815260206004820152601660248201527f496e76616c696420657363726f772061646472657373000000000000000000006044820152606401610056565b6001600160a01b0382166101195760405162461bcd60e51b815260206004820152601860248201527f496e76616c6964207265676973747279206164647265737300000000000000006044820152606401610056565b50600280546001600160a01b039384166001600160a01b03199182161790915560038054929093169116179055600b805460ff19169055610204565b600080546001600160a01b038381166001600160a01b0319831681178455604051919092169283917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a35050565b80516001600160a01b03811681146101bc57600080fd5b919050565b6000806000606084860312156101d657600080fd5b6101df846101a5565b92506101ed602085016101a5565b91506101fb604085016101a5565b90509250925092565b612f07806102136000396000f3fe608060405234801561001057600080fd5b506004361061025e5760003560e01c8063669ea37a11610146578063cd89b2e3116100c3578063e80a57a511610087578063e80a57a514610684578063ec0990791461068c578063eede9f8d14610694578063f2c93d3a146106a7578063f2fde38b146106ba578063fadaa14f146106cd57600080fd5b8063cd89b2e3146105e8578063d46f96ed14610610578063e1e1ff101461063e578063e42a96e714610651578063e502eb681461066457600080fd5b8063950c78221161010a578063950c78221461053f5780639ae3fb5114610561578063a2ca560c1461058c578063bec03dd114610596578063c241380b146105c157600080fd5b8063669ea37a146104b4578063715018a6146104dd5780638b3511f7146104e55780638da5cb5b146104f85780638ed10ca41461050957600080fd5b80632c0a3f89116101df578063491e5e40116101a3578063491e5e40146104205780634a778bc314610433578063581c281c146104465780636099c34b1461044e57806362fd1ae21461046157806363fceb711461048c57600080fd5b80632c0a3f89146103895780632ea5e6461461039c57806334e5c102146103bd57806346d1e91b146... [truncated]";

describe("DEVoterVoting", function () {
  async function deployVotingFixture() {
    const [owner, voter1, voter2, feeWallet, admin] =
      await hre.viem.getWalletClients();

    // Deploy MockDEVToken
    const mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
      owner.account.address,
      "MockDEVToken",
      "mDEV",
    ]);

    // Deploy DEVoterEscrow
    const devoterEscrow = await hre.viem.deployContract("DEVoterEscrow", [
      mockDEVToken.address,
      feeWallet.account.address,
      0, // No fee for testing
      3600, // 1 hour voting period for escrow
      owner.account.address,
    ]);

    // Deploy RepositoryRegistry
    const repositoryRegistry = await hre.viem.deployContract(
      "RepositoryRegistry",
      [owner.account.address],
    );

    // Deploy DEVoterVoting with explicit ABI and bytecode
    const devoterVoting = await hre.viem.deployContract("DEVoterVoting", [
      devoterEscrow.address,
      repositoryRegistry.address,
      owner.account.address,
    ]);

    // Grant VOTING_CONTRACT_ROLE to DEVoterVoting in DEVoterEscrow
    await devoterEscrow.write.setVotingContractAddress([devoterVoting.address]);

    // Mint tokens for voters
    await mockDEVToken.write.mint([voter1.account.address, 1000n]);
    await mockDEVToken.write.mint([voter2.account.address, 1000n]);

    // Approve escrow to spend tokens
    await mockDEVToken.write.approve([devoterEscrow.address, 1000n], {
      account: voter1.account.address,
    });
    await mockDEVToken.write.approve([devoterEscrow.address, 1000n], {
      account: voter2.account.address,
    });

    // Deposit into escrow
    await devoterEscrow.write.deposit([1000n], { account: voter1.account.address });
    await devoterEscrow.write.deposit([1000n], { account: voter2.account.address });

    // Register a repository
    await repositoryRegistry.write.registerRepository([
      1,
      voter1.account.address,
      "repo1",
      "url1",
      "desc1",
    ]);

    return {
      devoterVoting,
      devoterEscrow,
      mockDEVToken,
      repositoryRegistry,
      owner,
      voter1,
      voter2,
      feeWallet,
      admin,
    };
  }

  describe("Withdrawal Restriction", function () {
    it("should reject withdrawVoteWithErrorHandling within 24 hours of voting end", async function () {
      const { devoterVoting, owner, voter1 } = await loadFixture(
        deployVotingFixture,
      );

      const repositoryId = 1;
      const voteAmount = 100n;
      const VOTING_PERIOD_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

      // Start voting period
      await devoterVoting.write.startVotingPeriod([VOTING_PERIOD_DURATION], {
        account: owner.account.address,
      });

      // Cast a vote
      await devoterVoting.write.castVote([repositoryId, voteAmount], {
        account: voter1.account.address,
      });

      const votingEndTime = await devoterVoting.read.votingEndTime();
      const WITHDRAWAL_RESTRICTION_PERIOD =
        await devoterVoting.read.WITHDRAWAL_RESTRICTION_PERIOD();

      // Advance time to just before the restriction period (e.g., 24 hours and 1 second before voting ends)
      const timeToSetBeforeRestriction =
        votingEndTime - WITHDRAWAL_RESTRICTION_PERIOD + 1n;
      await time.increaseTo(timeToSetBeforeRestriction);

      // Attempt to withdraw - should still be allowed
      await expect(
        devoterVoting.write.withdrawVoteWithErrorHandling([
          repositoryId,
          voteAmount,
        ], { account: voter1.account.address }),
      ).to.not.be.rejected;

      // Re-cast vote for next test
      await devoterVoting.write.castVote([repositoryId, voteAmount], {
        account: voter1.account.address,
      });

      // Advance time to exactly the start of the restriction period (24 hours before voting ends)
      const timeToSetAtRestrictionStart =
        votingEndTime - WITHDRAWAL_RESTRICTION_PERIOD;
      await time.increaseTo(timeToSetAtRestrictionStart);

      // Attempt to withdraw - should be rejected
      await expect(
        devoterVoting.write.withdrawVoteWithErrorHandling([
          repositoryId,
          voteAmount,
        ], { account: voter1.account.address }),
      ).to.be.rejectedWith(
        `WithdrawalDeadlinePassed(${timeToSetAtRestrictionStart}n, ${timeToSetAtRestrictionStart}n)`,
      );

      // Advance time to within the restriction period (e.g., 12 hours before voting ends)
      const twelveHours = 12 * 60 * 60;
      const timeToSetWithinRestriction = votingEndTime - BigInt(twelveHours);
      await time.increaseTo(timeToSetWithinRestriction);

      // Attempt to withdraw - should be rejected
      await expect(
        devoterVoting.write.withdrawVoteWithErrorHandling([
          repositoryId,
          voteAmount,
        ], { account: voter1.account.address }),
      ).to.be.rejectedWith(
        `WithdrawalDeadlinePassed(${timeToSetAtRestrictionStart}n, ${timeToSetWithinRestriction}n)`,
      );

      // Advance time to just before voting ends (e.g., 1 second before voting ends)
      const oneSecond = 1;
      const timeToSetJustBeforeEnd = votingEndTime - BigInt(oneSecond);
      await time.increaseTo(timeToSetJustBeforeEnd);

      // Attempt to withdraw - should be rejected
      await expect(
        devoterVoting.write.withdrawVoteWithErrorHandling([
          repositoryId,
          voteAmount,
        ], { account: voter1.account.address }),
      ).to.be.rejectedWith(
        `WithdrawalDeadlinePassed(${timeToSetAtRestrictionStart}n, ${timeToSetJustBeforeEnd}n)`,
      );
    });
  });
});