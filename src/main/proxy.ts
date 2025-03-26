import axios, { AxiosRequestConfig } from "axios";
import fs from "fs";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { logMessage } from "../utils/logger";

export class ProxyManager {
  private proxyList: string[] = [];
  private axiosConfig: AxiosRequestConfig = {};

  public getProxyAgent(proxyUrl: string): HttpsProxyAgent<any> | SocksProxyAgent | undefined {
    try {
      if (!proxyUrl) {
        throw new Error("Proxy URL is empty");
      }

      const isSocks = proxyUrl.toLowerCase().startsWith("socks");
      if (isSocks) {
        return new SocksProxyAgent(proxyUrl);
      }
      return new HttpsProxyAgent(
        proxyUrl.startsWith("http") ? proxyUrl : `http://${proxyUrl}`
      );
    } catch (error) {
      if (error instanceof Error) {
        logMessage(`Error creating proxy agent: ${error.message}`, "error");
      } else {
        logMessage(`Error creating proxy agent`, "error");
      }
      return undefined;
    }
  }

  public loadProxies(): boolean {
    try {
      const proxyFile = fs.readFileSync("proxy.txt", "utf8");
      this.proxyList = proxyFile
        .split("\n")
        .filter((line) => line.trim())
        .map((proxy) => {
          proxy = proxy.trim();
          if (!proxy.includes("://")) {
            return `http://${proxy}`;
          }
          return proxy;
        });

      if (this.proxyList.length === 0) {
        throw new Error("No proxies found in proxy.txt");
      }
      logMessage(`Loaded ${this.proxyList.length} proxies from proxy.txt`, "success");
      return true;
    } catch (error) {
      if (error instanceof Error) {
        logMessage(`Error loading proxies: ${error.message}`, "error");
      } else {
        logMessage(`Error loading proxies`, "error");
      }
      return false;
    }
  }

  public async checkIP(): Promise<boolean> {
    try {
      const response = await axios.get("https://api.ipify.org?format=json", this.axiosConfig);
      const ip = response.data.ip;
      logMessage(`IP Using: ${ip}`, "success");
      return true;
    } catch (error) {
      if (error instanceof Error) {
        logMessage(`Failed to get IP: ${error.message}`, "error");
      } else {
        logMessage(`Failed to get IP`, "error");
      }
      return false;
    }
  }

  public async getRandomProxy(): Promise<string | null> {
    if (this.proxyList.length === 0) {
      this.axiosConfig = {};
      await this.checkIP();
      return null;
    }

    const shuffledProxies = [...this.proxyList].sort(() => Math.random() - 0.5);
    for (const proxy of shuffledProxies) {
      try {
        const agent = this.getProxyAgent(proxy,);
        if (!agent) continue;

        this.axiosConfig.httpsAgent = agent;
        await this.checkIP();
        return proxy;
      } catch (error) {
        logMessage(`Proxy ${proxy} failed, trying next...`, "warning");
      }
    }

    logMessage("All proxies failed, using default IP", "warning");
    this.axiosConfig = {};
    await this.checkIP();
    return null;
  }
}