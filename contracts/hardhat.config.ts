import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x" + "0".repeat(64);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Mantle Mainnet
    mantle: {
      url: "https://rpc.mantle.xyz",
      chainId: 5000,
      accounts: [PRIVATE_KEY],
    },
    // Mantle Sepolia Testnet
    mantleTestnet: {
      url: "https://rpc.sepolia.mantle.xyz",
      chainId: 5003,
      accounts: [PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: {
      mantle: process.env.MANTLE_EXPLORER_API_KEY || "",
      mantleTestnet: process.env.MANTLE_EXPLORER_API_KEY || "",
    },
    customChains: [
      {
        network: "mantle",
        chainId: 5000,
        urls: {
          apiURL: "https://explorer.mantle.xyz/api",
          browserURL: "https://explorer.mantle.xyz",
        },
      },
      {
        network: "mantleTestnet",
        chainId: 5003,
        urls: {
          apiURL: "https://explorer.sepolia.mantle.xyz/api",
          browserURL: "https://explorer.sepolia.mantle.xyz",
        },
      },
    ],
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
