// Load dependencies using CommonJS-style require for ESM compatibility
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("ERC-8004 Contracts", function () {
  let identityRegistry: any;
  let reputationRegistry: any;
  let owner: any;
  let addr1: any;
  let addr2: any;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy Identity Registry
    const IdentityRegistry = await ethers.getContractFactory("ERC8004IdentityRegistry");
    identityRegistry = await IdentityRegistry.deploy(
      "ShalomAgentIdentity",
      "SAI",
      owner.address
    );
    await identityRegistry.waitForDeployment();

    // Deploy Reputation Registry as proxy
    const ReputationRegistry = await ethers.getContractFactory("ERC8004ReputationRegistry");
    reputationRegistry = await upgrades.deployProxy(
      ReputationRegistry,
      [await identityRegistry.getAddress()],
      { kind: "uups", initializer: "initialize" }
    );
    await reputationRegistry.waitForDeployment();
  });

  describe("Identity Registry", function () {
    it("Should have correct name and symbol", async function () {
      expect(await identityRegistry.name()).to.equal("ShalomAgentIdentity");
      expect(await identityRegistry.symbol()).to.equal("SAI");
    });

    it("Should register a new agent", async function () {
      const tx = await identityRegistry.connect(addr1).register("ipfs://test");
      await tx.wait();

      expect(await identityRegistry.totalAgents()).to.equal(1);
      expect(await identityRegistry.ownerOf(0)).to.equal(addr1.address);
    });

    it("Should register agent with metadata", async function () {
      const metadata = [
        { metadataKey: "name", metadataValue: ethers.toUtf8Bytes("TestAgent") },
        { metadataKey: "version", metadataValue: ethers.toUtf8Bytes("1.0") }
      ];

      const tx = await identityRegistry.connect(addr1).register("ipfs://test", metadata);
      await tx.wait();

      const nameMeta = await identityRegistry.getMetadata(0, "name");
      expect(ethers.toUtf8String(nameMeta)).to.equal("TestAgent");
    });

    it("Should track owned agents", async function () {
      await identityRegistry.connect(addr1).register("ipfs://test1");
      await identityRegistry.connect(addr1).register("ipfs://test2");
      await identityRegistry.connect(addr2).register("ipfs://test3");

      const addr1Agents = await identityRegistry.agentsOf(addr1.address);
      expect(addr1Agents.length).to.equal(2);
      
      const addr2Agents = await identityRegistry.agentsOf(addr2.address);
      expect(addr2Agents.length).to.equal(1);
    });
  });

  describe("Reputation Registry", function () {
    beforeEach(async function () {
      // Register an agent
      await identityRegistry.connect(addr1).register("ipfs://test");
    });

    it("Should submit feedback", async function () {
      const tx = await reputationRegistry.connect(addr2).giveFeedback(
        0, // agentId
        100, // value
        2, // decimals
        "quality", // tag1
        "", // tag2
        "https://example.com", // endpoint
        "", // feedbackURI
        ethers.ZeroHash // feedbackHash
      );
      await tx.wait();

      const [count, summaryValue, decimals] = await reputationRegistry.getSummary(
        0, [], "", ""
      );
      expect(count).to.equal(1);
    });

    it("Should get valid tags", async function () {
      const tags = await reputationRegistry.getValidTags();
      expect(tags).to.include("quality");
      expect(tags).to.include("reliability");
    });

    it("Should prevent unauthorized response", async function () {
      // addr2 is not the agent owner
      await expect(
        reputationRegistry.connect(addr2).appendResponse(
          0, addr2.address, 1, "", ethers.ZeroHash
        )
      ).to.be.reverted;
    });
  });
});