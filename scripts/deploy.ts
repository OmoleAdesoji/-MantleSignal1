import { ethers, run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\n🚀 Deploying MantleSignalRegistry`);
  console.log(`   Network  : ${network.name}`);
  console.log(`   Deployer : ${deployer.address}`);
  console.log(`   Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} MNT\n`);

  // The agent address — can be updated later via setAgent()
  const agentAddress = process.env.AGENT_ADDRESS || deployer.address;

  const Factory = await ethers.getContractFactory("MantleSignalRegistry");
  const contract = await Factory.deploy(agentAddress);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`✅ MantleSignalRegistry deployed to: ${address}`);

  // Save address for the agent + frontend to pick up
  const deployment = {
    network:   network.name,
    chainId:   (await ethers.provider.getNetwork()).chainId.toString(),
    address,
    agentAddress,
    deployedAt: new Date().toISOString(),
    deployer:  deployer.address,
  };

  const outDir  = path.join(__dirname, "../deployments");
  const outFile = path.join(outDir, `${network.name}.json`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`📄 Deployment saved to ${outFile}`);

  // Verify on explorer (skip on local networks)
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\n🔍 Verifying on Mantle Explorer (waiting 10s for indexing)...");
    await new Promise(r => setTimeout(r, 10_000));
    try {
      await run("verify:verify", {
        address,
        constructorArguments: [agentAddress],
      });
      console.log("✅ Contract verified on Mantle Explorer");
    } catch (err: any) {
      if (err.message?.includes("Already Verified")) {
        console.log("ℹ️  Already verified");
      } else {
        console.warn("⚠️  Verification failed:", err.message);
      }
    }
  }

  console.log(`\n📋 Summary`);
  console.log(`   Contract  : ${address}`);
  console.log(`   Explorer  : https://explorer.mantle.xyz/address/${address}`);
  console.log(`   Add this to your .env: CONTRACT_ADDRESS=${address}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
