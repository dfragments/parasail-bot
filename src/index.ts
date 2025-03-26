import chalk from "chalk";
import fs from "fs";
import { parasailNetwork } from "./main/parasailNetwork";
import { ProxyManager } from "./main/proxy";
import { logMessage } from "./utils/logger";

const proxyManager = new ProxyManager();

async function main(): Promise<void> {
  console.log(
    chalk.cyan(`
░█▀█░█▀█░█▀▄░█▀█░█▀▀░█▀█░▀█▀░█░░
░█▀▀░█▀█░█▀▄░█▀█░▀▀█░█▀█░░█░░█░░
░▀░░░▀░▀░▀░▀░▀░▀░▀▀▀░▀░▀░▀▀▀░▀▀▀
        By : El Puqus Airdrop
        github.com/ahlulmukh
      Use it at your own risk
  `)
  );

  try {
    const accounts = fs
      .readFileSync("privatekey.txt", "utf8")
      .split("\n")
      .filter(Boolean);
    const count = accounts.length;
    const proxiesLoaded = proxyManager.loadProxies();
    if (!proxiesLoaded) {
      logMessage("Failed to load proxies, using default IP", "warning");
    }
    logMessage(`Loaded ${count} accounts`, "info");
    console.log(chalk.greenBright("-".repeat(85)));

    await Promise.all(accounts.map(async (account, i) => {
      const currentProxy = await proxyManager.getRandomProxy();
      const pr = new parasailNetwork(account, currentProxy,);
      await pr.singleProses();
    }));
  } catch (error: any) {
    logMessage(`Error: ${(error as any).message}`, "error");
  }
}

main().catch((err) => {
  console.error(chalk.red("Error occurred:"), err);
  process.exit(1);
});