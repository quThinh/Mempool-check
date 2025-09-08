#!/usr/bin/env node

/**
 * Mempool Monitor - TypeScript version with ethers.js
 * Monitors the mempool for transactions from a specific wallet address
 * and tracks the timestamp when transactions first appear.
 */

import axios, { AxiosResponse } from 'axios';
import { ethers } from 'ethers';
import {
  MempoolResult,
  JsonRpcResponse,
  TransactionWithMetadata,
  MonitorConfig,
  MonitorStats,
  MempoolTransaction
} from './types';

class MempoolMonitor {
  private config: MonitorConfig;
  private seenTransactions: Set<string> = new Set();
  private firstSeenTimes: Map<string, Date> = new Map();
  private startTime: Date = new Date();
  private isRunning: boolean = false;

  constructor(config: MonitorConfig) {
    this.config = {
      ...config,
      walletAddress: ethers.getAddress(config.walletAddress) // Normalize address
    };
  }

  /**
   * Make a request to the mempool API
   */
  private async makeApiRequest(): Promise<MempoolResult | null> {
    const payload = {
      jsonrpc: '2.0',
      method: 'txpool_content',
      params: [],
      id: 1
    };

    try {
      const response: AxiosResponse<JsonRpcResponse> = await axios.post(
        this.config.apiUrl,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.data.result) {
        return response.data.result;
      }
      return null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`❌ API request failed: ${error.message}`);
      } else {
        console.error(`❌ Unexpected error: ${error}`);
      }
      return null;
    }
  }

  /**
   * Extract transactions from an address's data
   */
  private extractTransactionsFromAddress(
    addressData: { [nonce: string]: MempoolTransaction },
    poolType: 'pending' | 'queued'
  ): TransactionWithMetadata[] {
    const transactions: TransactionWithMetadata[] = [];

    for (const [nonce, tx] of Object.entries(addressData)) {
      const txWithMetadata: TransactionWithMetadata = {
        ...tx,
        poolType,
        firstSeen: new Date(),
        nonce
      };
      transactions.push(txWithMetadata);
    }

    return transactions;
  }

  /**
   * Check the mempool for transactions from the monitored wallet
   */
  private async checkMempool(): Promise<{
    newTransactions: TransactionWithMetadata[];
    allWalletTransactions: TransactionWithMetadata[];
  }> {
    const mempoolData = await this.makeApiRequest();
    if (!mempoolData) {
      return { newTransactions: [], allWalletTransactions: [] };
    }

    const allWalletTransactions: TransactionWithMetadata[] = [];
    const newTransactions: TransactionWithMetadata[] = [];

    // Check both pending and queued transactions
    for (const poolType of ['pending', 'queued'] as const) {
      const poolData = mempoolData[poolType];

      if (poolData && poolData[this.config.walletAddress]) {
        const addressTransactions = this.extractTransactionsFromAddress(
          poolData[this.config.walletAddress],
          poolType
        );

        for (const tx of addressTransactions) {
          allWalletTransactions.push(tx);

          // Check if this is a new transaction
          if (!this.seenTransactions.has(tx.hash)) {
            this.seenTransactions.add(tx.hash);
            this.firstSeenTimes.set(tx.hash, new Date());
            newTransactions.push(tx);
          }
        }
      }
    }

    return { newTransactions, allWalletTransactions };
  }

  /**
   * Format transaction information for display
   */
  private formatTransactionInfo(tx: TransactionWithMetadata): string {
    const valueEth = ethers.formatEther(tx.value);
    const gasPriceGwei = ethers.formatUnits(tx.gasPrice, 'gwei');

    return `
        📄 Transaction Hash: ${tx.hash}
        🔢 Nonce: ${tx.nonce}
        📍 Pool: ${tx.poolType}
        ➡️  To: ${tx.to}
        💰 Value: ${valueEth} ETH
        ⛽ Gas Price: ${gasPriceGwei} Gwei
        📊 Gas Limit: ${tx.gas}
        📝 Data: ${tx.data === '0x' ? 'No data' : `${tx.data.substring(0, 20)}...`}
    `;
  }

  /**
   * Get current monitoring statistics
   */
  private getStats(allWalletTransactions: TransactionWithMetadata[]): MonitorStats {
    return {
      totalTransactionsSeen: this.seenTransactions.size,
      walletTransactionsInMempool: allWalletTransactions.length,
      newTransactionsThisCheck: 0, // Will be set by caller
      startTime: this.startTime
    };
  }

  /**
   * Display monitoring header
   */
  private displayHeader(): void {
    console.log(`🚀 Starting mempool monitor for wallet: ${this.config.walletAddress}`);
    console.log(`🌐 API Endpoint: ${this.config.apiUrl}`);
    console.log(`⏱️  Check interval: ${this.config.checkInterval} seconds`);
    console.log('='.repeat(60));
  }

  /**
   * Display new transactions
   */
  private displayNewTransactions(newTransactions: TransactionWithMetadata[]): void {
    for (const tx of newTransactions) {
      const firstSeen = this.firstSeenTimes.get(tx.hash);
      console.log(`\n🆕 NEW TRANSACTION DETECTED!`);
      console.log(`⏰ First seen: ${firstSeen?.toISOString().replace('T', ' ').substring(0, 23)}`);
      console.log(this.formatTransactionInfo(tx));
      console.log('-'.repeat(40));
    }
  }

  /**
   * Display monitoring status
   */
  private displayStatus(allWalletTransactions: TransactionWithMetadata[], newCount: number): void {
    const currentTime = new Date().toLocaleTimeString();
    console.log(
      `[${currentTime}] Monitoring... | Total wallet txs in mempool: ${allWalletTransactions.length} | New txs: ${newCount}`
    );
  }

  /**
   * Display shutdown summary
   */
  private displaySummary(): void {
    console.log(`\n\n🛑 Monitoring stopped by user`);
    console.log(`📊 Summary:`);
    console.log(`   Total unique transactions seen: ${this.seenTransactions.size}`);
    console.log(`   Wallet address monitored: ${this.config.walletAddress}`);
    console.log(`   Monitoring duration: ${this.getDuration()}`);

    if (this.firstSeenTimes.size > 0) {
      console.log(`\n📋 Transaction Timeline:`);
      const sortedTransactions = Array.from(this.firstSeenTimes.entries())
        .sort(([, a], [, b]) => a.getTime() - b.getTime());

      for (const [txHash, firstSeen] of sortedTransactions) {
        console.log(`   ${firstSeen.toISOString().replace('T', ' ').substring(0, 23)} - ${txHash}`);
      }
    }
  }

  /**
   * Get monitoring duration
   */
  private getDuration(): string {
    const duration = Date.now() - this.startTime.getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Start monitoring
   */
  public async start(): Promise<void> {
    this.isRunning = true;
    this.displayHeader();

    // Setup graceful shutdown
    process.on('SIGINT', () => {
      this.isRunning = false;
      this.displaySummary();
      process.exit(0);
    });

    try {
      while (this.isRunning) {
        const { newTransactions, allWalletTransactions } = await this.checkMempool();

        this.displayNewTransactions(newTransactions);
        this.displayStatus(allWalletTransactions, newTransactions.length);

        await this.sleep(this.config.checkInterval * 1000);
      }
    } catch (error) {
      console.error(`❌ Monitoring error: ${error}`);
      this.displaySummary();
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): MonitorConfig {
  const args = process.argv.slice(2);
  let walletAddress = '';
  let apiUrl = 'http://0.0.0.0:26545';
  let checkInterval = 1.0;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--wallet':
      case '-w':
        walletAddress = args[++i];
        break;
      case '--api-url':
      case '-a':
        apiUrl = args[++i];
        break;
      case '--interval':
      case '-i':
        checkInterval = parseFloat(args[++i]);
        break;
      case '--help':
      case '-h':
        displayHelp();
        process.exit(0);
        break;
    }
  }

  if (!walletAddress) {
    console.error('❌ Error: Wallet address is required. Use --wallet or -w');
    displayHelp();
    process.exit(1);
  }

  // Validate wallet address
  try {
    ethers.getAddress(walletAddress);
  } catch (error) {
    console.error('❌ Error: Invalid wallet address format');
    process.exit(1);
  }

  return { apiUrl, walletAddress, checkInterval };
}

/**
 * Display help information
 */
function displayHelp(): void {
  console.log(`
Usage: npm run dev -- --wallet <address> [options]

Options:
  --wallet, -w     Wallet address to monitor (required)
  --api-url, -a    JSON-RPC API endpoint URL (default: http://0.0.0.0:26545)
  --interval, -i   Check interval in seconds (default: 1.0)
  --help, -h       Show this help message

Examples:
  npm run dev -- --wallet 0x1234567890123456789012345678901234567890
  npm run dev -- --wallet 0x1234...7890 --api-url http://localhost:8545 --interval 0.5
`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    const config = parseArgs();
    const monitor = new MempoolMonitor(config);
    await monitor.start();
  } catch (error) {
    console.error(`❌ Fatal error: ${error}`);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main();
}
