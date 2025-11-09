/**
 * @title LockModule
 * @author The Gemini CLI
 * @notice This module deploys the Lock contract.
 * @dev This module uses Hardhat Ignition to manage the deployment process of the Lock contract.
 * The Lock contract is a simple time-locked contract that allows the owner to withdraw funds after a specified unlock time.
 *
 * To deploy this module, use the command:
 * `npx hardhat ignition deploy ignition/modules/Lock.ts --parameters '{"unlockTime": <timestamp_in_seconds>}'`
 *
 * Example:
 * `npx hardhat ignition deploy ignition/modules/Lock.ts --parameters '{"unlockTime": 1767225600}'`
 * (This example uses an unlock time of January 1, 2026, 00:00:00 UTC)
 */
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const LockModule = buildModule("LockModule", (m) => {
  // Define the unlock time parameter for the Lock contract constructor.
  // This parameter must be provided during deployment.
  const unlockTime = m.getParameter<number>("unlockTime");
  const lockedAmount = m.getParameter<bigint>("lockedAmount");

  // Deploy the Lock contract.
  // The constructor requires an unlock time (uint).
  const lock = m.contract("Lock", [unlockTime], { value: lockedAmount });

  // Return the deployed contract to make it accessible from other modules or for verification.
  return { lock };
});

export default LockModule;
