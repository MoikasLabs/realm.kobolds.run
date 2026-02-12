import { ethers, upgrades } from "hardhat";

async function main() {
  console.log("Testing ERC-8004 deployment...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Deploy Identity Registry
  console.log("\n1. Deploying Identity Registry...");
  const IdentityRegistry = await ethers.getContractFactory("ERC8004IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy(
    "ShalomAgentIdentity",
    "SAI",
    deployer.address
  );
  await identityRegistry.waitForDeployment();
  const identityAddress = await identityRegistry.getAddress();
  console.log("   Identity Registry:", identityAddress);

  // Deploy Reputation Registry
  console.log("\n2. Deploying Reputation Registry...");
  const ReputationRegistry = await ethers.getContractFactory("ERC8004ReputationRegistry");
  const reputationRegistry = await upgrades.deployProxy(
    ReputationRegistry,
    [identityAddress],
    { kind: "uups", initializer: "initialize" }
  );
  await reputationRegistry.waitForDeployment();
  const reputationAddress = await reputationRegistry.getAddress();
  console.log("   Reputation Registry:", reputationAddress);

  // Test basic functionality
  console.log("\n3. Testing basic functionality...");
  
  // Register an agent
  const registerTx = await identityRegistry["register(string)"]("ipfs://QmTest");
  await registerTx.wait();
  console.log("   ✓ Agent registered (ID: 0)");

  // Check owner
  const owner = await identityRegistry.ownerOf(0);
  console.log("   ✓ Agent owner:", owner);

  // Submit feedback
  const feedbackTx = await reputationRegistry.giveFeedback(
    0,
    100,
    2,
    "quality",
    "",
    "https://example.com",
    "",
    ethers.ZeroHash
  );
  await feedbackTx.wait();
  console.log("   ✓ Feedback submitted");

  // Get summary
  const [count, summary, decimals] = await reputationRegistry.getSummary(0, [], "", "");
  console.log("   ✓ Feedback count:", count.toString());
  console.log("   ✓ Summary value:", summary.toString());

  console.log("\n✅ All tests passed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });