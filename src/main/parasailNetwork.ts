import axios, { AxiosResponse } from "axios";
import { ethers } from "ethers";
import UserAgent from 'user-agents';
import { logMessage } from "../utils/logger";
import { ProxyManager } from "./proxy";
const userAgent = new UserAgent();

export class parasailNetwork {
  private proxyManager: ProxyManager;
  private proxy: string | null;
  private privatekey: any;
  private axiosConfig: any;
  private wallet: ethers.Wallet;
  private checkInInterval?: NodeJS.Timeout;
  private statsInterval?: NodeJS.Timeout;
  private currentToken?: string;

  constructor(privatekey: any, proxy: string | null = null) {
    this.privatekey = privatekey;
    this.proxy = proxy;
    this.wallet = new ethers.Wallet(this.privatekey);
    this.proxyManager = new ProxyManager();
    this.axiosConfig = {
      ...(this.proxy && { httpsAgent: this.proxyManager.getProxyAgent(this.proxy) }),
      headers: {
        "User-Agent": userAgent.toString(),
        origin: "https://www.parasail.network",
        Referer: "https://www.parasail.network/season"
      }
    };
  }

  async makeRequest(method: string, url: string, config: any = {}, retries: number = 3): Promise<AxiosResponse | null> {
    for (let i = 0; i < retries; i++) {
      try {

        const response = await axios({
          method,
          url,
          ...this.axiosConfig,
          ...config,
        });
        return response;
      } catch (error: any) {
        if (i === retries - 1) {
          logMessage(`Request failed: ${(error as any).message}`, "error");
          return null;
        }
        logMessage(`Retrying... (${i + 1}/${retries})`, "error");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    return null;
  }

  async getSignature() {
    const message = "By signing this message, you confirm that you agree to the Parasail Terms of Service.\n\nParasail (including the Website and Parasail Smart Contracts) is not intended for:\n(a) access and/or use by Excluded Persons;\n(b) access and/or use by any person or entity in, or accessing or using the Website from, an Excluded Jurisdiction.\n\nExcluded Persons are prohibited from accessing and/or using Parasail (including the Website and Parasail Smart Contracts).\n\nFor full terms, refer to: https://parasail.network/Parasail_User_Terms.pdf\n";
    const signature = await this.wallet.signMessage(message);
    return signature;
  }

  async loginAccount(signature: string) {
    logMessage(`Logging in account: ${this.wallet.address}`, "info");
    const payload = {
      address: this.wallet.address,
      msg: "By signing this message, you confirm that you agree to the Parasail Terms of Service.\n\nParasail (including the Website and Parasail Smart Contracts) is not intended for:\n(a) access and/or use by Excluded Persons;\n(b) access and/or use by any person or entity in, or accessing or using the Website from, an Excluded Jurisdiction.\n\nExcluded Persons are prohibited from accessing and/or using Parasail (including the Website and Parasail Smart Contracts).\n\nFor full terms, refer to: https://parasail.network/Parasail_User_Terms.pdf\n",
      signature: signature
    }

    try {
      const response = await this.makeRequest("POST", "https://www.parasail.network/api/user/verify", { data: payload });
      if (!response) return null
      logMessage(`Account logged in: ${this.wallet.address}`, "success");
      return response.data.token;
    } catch (error: any) {
      logMessage(`Failed to login account: ${this.wallet.address}`, "error");
      return null;
    }
  }

  async onBoard(token: string) {
    const headers = {
      Authorization: `Bearer ${token}`
    }
    const payload = {
      address: this.wallet.address,
    }
    try {
      const response = await this.makeRequest("POST", "https://www.parasail.network/api/v1/node/onboard", { data: payload, headers });
      if (!response) return null;
      return response.data;
    } catch (error: any) {
      logMessage(`Failed to onboard account: ${this.wallet.address}`, "error");
      return null;
    }
  }

  async checkIn(token: string) {
    const headers = {
      Authorization: `Bearer ${token}`
    }
    const payload = {
      address: this.wallet.address,
    }
    try {
      const response = await this.makeRequest("POST", "https://www.parasail.network/api/v1/node/check_in", { data: payload, headers });
      if (!response) return null;
      logMessage(`Account checked in: ${this.wallet.address}`, "success");
      return response.data;
    } catch (error: any) {
      logMessage(`Failed to check in account: ${this.wallet.address}`, "error");
      return null;

    }
  }

  async getStats(token: string) {
    logMessage(`Getting stats for account: ${this.wallet.address}`, "info");
    const headers = {
      Authorization: `Bearer ${token}`
    }
    try {
      const response = await this.makeRequest("GET", `https://www.parasail.network/api/v1/node/node_stats?address=${this.wallet.address}`, { headers });
      if (!response) return null;
      logMessage(`Stats received for account: ${this.wallet.address}`, "success");
      return response.data;
    } catch (error: any) {
      logMessage(`Failed to get stats for account: ${this.wallet.address}`, "error");
      return
    }
  }

  private getCheckInDelay(lastCheckinTime: number): number {
    const now = Math.floor(Date.now() / 1000);
    const nextCheckInTime = lastCheckinTime + 24 * 60 * 60;
    const delay = (nextCheckInTime - now) * 1000;
    return Math.max(delay, 0);
  }

  async singleProses() {
    try {
      const signature = await this.getSignature();
      if (!signature) return;
      this.currentToken = await this.loginAccount(signature);
      if (!this.currentToken) return;
      await this.onBoard(this.currentToken);
      await this.setupIntervals();
    } catch (error: any) {
      logMessage(`Failed to single proses: ${error.message}`, "error");
    }
  }

  private async setupIntervals() {
    this.clearIntervals();
    const stats = await this.getStats(this.currentToken!);
    if (!stats?.data) return;
    this.logStats(stats.data.points, stats.data.last_checkin_time);
    this.statsInterval = setInterval(async () => {
      const stats = await this.getStats(this.currentToken!);
      if (stats?.data) {
        this.logStats(stats.data.points, stats.data.last_checkin_time);
      }
    }, 60 * 60 * 1000);
    if (stats.data.last_checkin_time !== undefined) {
      const delay = this.getCheckInDelay(stats.data.last_checkin_time);

      this.checkInInterval = setTimeout(async () => {
        await this.checkIn(this.currentToken!);
        this.logStats(stats.data.points, Math.floor(Date.now() / 1000));
        this.checkInInterval = setInterval(async () => {
          await this.checkIn(this.currentToken!);
          this.logStats(stats.data.points, Math.floor(Date.now() / 1000));
        }, 24 * 60 * 60 * 1000);

      }, delay);
    }
  }

  private logStats(points: number, lastCheckinTime: number | undefined) {
    let checkInInfo = "";

    if (lastCheckinTime !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      const nextCheckIn = lastCheckinTime + 24 * 60 * 60;
      const hoursLeft = ((nextCheckIn - now) / 3600).toFixed(2);

      checkInInfo = ` | Next check-in: ${new Date(nextCheckIn * 1000).toLocaleString()} (${hoursLeft} hours left)`;
    } else {
      checkInInfo = " | Check-in time: Not available";
    }

    logMessage(
      `Current Points: ${points}${checkInInfo} | Address: ${this.wallet.address}`,
      "info");
  }

  private clearIntervals() {
    if (this.checkInInterval) clearInterval(this.checkInInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);
  }

}
