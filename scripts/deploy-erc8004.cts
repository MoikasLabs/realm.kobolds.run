import { ethers, upgrades, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentAddresses {
  network: string;
  chainId: number;
  deployer: string;
  deploymentTime: string;
  contracts: {
    identityRegistry: {
      address: string;
      name: string;
      symbol: string;
      txHash: string;
      blockNumber: number;
    };
    reputationRegistry: {
      address: string;
      identityRegistry: string;
      txHash: string;
      blockNumber: number;
      implementation?: string;
    };
  };
  verification?: {
    identityRegistry?: string;
    reputationRegistry?: string;
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log("ERC-8004 Identity & Reputation Registry Deployment");
  console.log("=".repeat(60));

  // Get network info
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const networkName = getNetworkName(chainId);
  
  console.log(`\nNetwork: ${networkName} (Chain ID: ${chainId})`);

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance < ethers.parseEther("0.001")) {
    console.warn("\n⚠️  Warning: Low balance. Make sure you have enough ETH for deployment.");
    console.warn("   Get testnet ETH from: https://www.alchemy.com/faucets/base-sepolia");
  }

  // Prepare deployment record
  const deploymentRecord: DeploymentAddresses = {
    network: networkName,
    chainId: chainId,
    deployer: deployer.address,
    deploymentTime: new Date().toISOString(),
    contracts: {
      identityRegistry: {
        address: "",
        name: "ShalomAgentIdentity",
        symbol: "SAI",
        txHash: "",
        blockNumber: 0,
      },
      reputationRegistry: {
        address: "",
        identityRegistry: "",
        txHash: "",
        blockNumber: 0,
      },
    },
  };

  // ============ Step 1: Deploy Identity Registry ============
  console.log("\n" + "-".repeat(60));
  console.log("Step 1: Deploying Identity Registry...");
  console.log("-".repeat(60));

  const IdentityRegistry = await ethers.getContractFactory("ERC8004IdentityRegistry");
  
  const identityName = "ShalomAgentIdentity";
  const identitySymbol = "SAI";
  
  console.log(`  Name: ${identityName}`);
  console.log(`  Symbol: ${identitySymbol}`);
  
  const identityRegistry = await IdentityRegistry.deploy(
    identityName,
    identitySymbol,
    deployer.address
  );
  
  await identityRegistry.waitForDeployment();
  const identityAddress = await identityRegistry.getAddress();
  const identityReceipt = await identityRegistry.deploymentTransaction()!.wait();
  
  console.log(`  ✅ Identity Registry deployed to: ${identityAddress}`);
  console.log(`  Transaction: ${identityRegistry.deploymentTransaction()!.hash}`);
  console.log(`  Block: ${identityReceipt!.blockNumber}`);
  
  deploymentRecord.contracts.identityRegistry.address = identityAddress;
  deploymentRecord.contracts.identityRegistry.txHash = identityRegistry.deploymentTransaction()!.hash;
  deploymentRecord.contracts.identityRegistry.blockNumber = identityReceipt!.blockNumber;

  // ============ Step 2: Deploy Reputation Registry (Proxy) ============
  console.log("\n" + "-".repeat(60));
  console.log("Step 2: Deploying Reputation Registry...");
  console.log("-".repeat(60));

  const ReputationRegistry = await ethers.getContractFactory("ERC8004ReputationRegistry");
  
  console.log("  Deploying proxy with implementation...");
  
  const reputationRegistry = await upgrades.deployProxy(
    ReputationRegistry,
    [identityAddress],
    {
      kind: "uups",
      initializer: "initialize",
    }
  );
  
  await reputationRegistry.waitForDeployment();
  const reputationAddress = await reputationRegistry.getAddress();
  const reputationReceipt = await reputationRegistry.deploymentTransaction()!.wait();
  
  // Get implementation address
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(reputationAddress);
  
  console.log(`  ✅ Reputation Registry deployed to: ${reputationAddress}`);
  console.log(`  Implementation: ${implementationAddress}`);
  console.log(`  Transaction: ${reputationRegistry.deploymentTransaction()!.hash}`);
  console.log(`  Block: ${reputationReceipt!.blockNumber}`);
  
  deploymentRecord.contracts.reputationRegistry.address = reputationAddress;
  deploymentRecord.contracts.reputationRegistry.identityRegistry = identityAddress;
  deploymentRecord.contracts.reputationRegistry.txHash = reputationRegistry.deploymentTransaction()!.hash;
  deploymentRecord.contracts.reputationRegistry.blockNumber = reputationReceipt!.blockNumber;
  deploymentRecord.contracts.reputationRegistry.implementation = implementationAddress;

  // ============ Step 3: Verify Identity Registry is set correctly ============
  console.log("\n" + "-".repeat(60));
  console.log("Step 3: Verifying setup...");
  console.log("-".repeat(60));
  
  const storedIdentity = await reputationRegistry.getIdentityRegistry();
  console.log(`  Reputation Registry linked to Identity: ${storedIdentity}`);
  console.log(`  ${storedIdentity.toLowerCase() === identityAddress.toLowerCase() ? '✅' : '❌'} Link verified`);

  // ============ Step 4: Save Deployment Addresses ============
  console.log("\n" + "-".repeat(60));
  console.log("Step 4: Saving deployment addresses...");
  console.log("-".repeat(60));

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const deploymentFile = path.join(deploymentsDir, `${networkName}-${chainId}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentRecord, null, 2));
  console.log(`  ✅ Saved to: ${deploymentFile}`);

  // ============ Step 5: Contract Verification ============
  console.log("\n" + "-".repeat(60));
  console.log("Step 5: Verifying contracts on block explorer...");
  console.log("-".repeat(60));

  const autoVerify = process.env.AUTO_VERIFY !== "false";
  
  if (chainId === 31337 || chainId === 1337) {
    console.log("  ⏭️  Skipping verification for local network");
  } else if (!autoVerify) {
    console.log("  ⏭️  AUTO_VERIFY=false, skipping verification");
    console.log("  Run manually with: npx hardhat verify --network " + networkName);
  } else {
    // Wait for block confirmations
    console.log("  Waiting for block confirmations...");
    await identityRegistry.deploymentTransaction()!.wait(5);
    await reputationRegistry.deploymentTransaction()!.wait(5);
    
    // Verify Identity Registry
    console.log("\n  Verifying Identity Registry...");
    try {
      await run("verify:verify", {
        address: identityAddress,
        constructorArguments: [identityName, identitySymbol, deployer.address],
      });
      console.log("  ✅ Identity Registry verified");
      deploymentRecord.verification = deploymentRecord.verification || {};
      deploymentRecord.verification!.identityRegistry = "verified";
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log("  ✅ Identity Registry already verified");
        deploymentRecord.verification = deploymentRecord.verification || {};
        deploymentRecord.verification!.identityRegistry = "already_verified";
      } else {
        console.log("  ❌ Identity Registry verification failed:", error.message);
        deploymentRecord.verification = deploymentRecord.verification || {};
        deploymentRecord.verification!.identityRegistry = "failed";
      }
    }
    
    // Verify Reputation Registry Implementation
    console.log("\n  Verifying Reputation Registry implementation...");
    try {
      await run("verify:verify", {
        address: implementationAddress,
        constructorArguments: [],
      });
      console.log("  ✅ Reputation Registry implementation verified");
      deploymentRecord.verification!.reputationRegistry = "verified";
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log("  ✅ Reputation Registry already verified");
        deploymentRecord.verification!.reputationRegistry = "already_verified";
      } else {
        console.log("  ❌ Reputation Registry verification failed:", error.message);
        deploymentRecord.verification!.reputationRegistry = "failed";
      }
    }
    
    // Update deployment file with verification status
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentRecord, null, 2));
  }

  // ============ Summary ============
  console.log("\n" + "=".repeat(60));
  console.log("Deployment Complete!");
  console.log("=".repeat(60));
  
  console.log("\n📝 Summary:");
  console.log(`  Network: ${networkName} (${chainId})`);
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Identity Registry: ${identityAddress}`);
  console.log(`  Reputation Registry: ${reputationAddress}`);
  console.log(`  Deployment file: ${deploymentFile}`);
  
  console.log("\n🔗 Block Explorer Links:");
  if (chainId === 84532) {
    console.log(`  Identity: https://sepolia.basescan.org/address/${identityAddress}`);
    console.log(`  Reputation: https://sepolia.basescan.org/address/${reputationAddress}`);
  } else if (chainId === 8453) {
    console.log(`  Identity: https://basescan.org/address/${identityAddress}`);
    console.log(`  Reputation: https://basescan.org/address/${reputationAddress}`);
  }

  console.log("\n✅ All done!");
}

function getNetworkName(chainId: number): string {
  switch (chainId) {
    case 1:
      return "mainnet";
    case 5:
      return "goerli";
    case 11155111:
      return "sepolia";
    case 8453:
      return "base";
    case 84532:
      return "base-sepolia";
    case 31337:
      return "localhost";
    case 1337:
      return "hardhat";
    default:
      return `unknown-${chainId}`;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });