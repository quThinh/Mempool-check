#!/usr/bin/env node

/**
 * Mempool Data Collector
 * Reads mempool data and saves it to JSON files in the result folder
 */

import axios, { AxiosResponse } from 'axios';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import {
  MempoolResult,
  JsonRpcResponse,
  MempoolTransaction
} from './types';

interface MempoolDataFile {
  timestamp: string;
  blockNumber?: number;
  mempoolData: MempoolResult;
  summary: {
    pendingAddresses: number;
    queuedAddresses: number;
    totalAddresses: number;
    pendingTransactions: number;
    queuedTransactions: number;
    totalTransactions: number;
  };
  metadata: {
    apiUrl: string;
    collectionTime: string;
    version: string;
  };
}

class MempoolCollector {
  private apiUrl: string;
  private resultDir: string;
  private isRunning: boolean = false;

  constructor(apiUrl: string, resultDir: string = './result') {
    this.apiUrl = apiUrl;
    this.resultDir = resultDir;
    this.ensureResultDir();
  }

  /**
   * Ensure result directory exists
   */
  private ensureResultDir(): void {
    if (!fs.existsSync(this.resultDir)) {
      fs.mkdirSync(this.resultDir, { recursive: true });
      console.log(`📁 Created result directory: ${this.resultDir}`);
    }
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
        this.apiUrl,
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
   * Count transactions in mempool data
   */
  private countTransactions(mempoolData: MempoolResult): {
    pendingTransactions: number;
    queuedTransactions: number;
  } {
    let pendingCount = 0;
    let queuedCount = 0;

    // Count pending transactions
    for (const addressData of Object.values(mempoolData.pending || {})) {
      pendingCount += Object.keys(addressData).length;
    }

    // Count queued transactions
    for (const addressData of Object.values(mempoolData.queued || {})) {
      queuedCount += Object.keys(addressData).length;
    }

    return {
      pendingTransactions: pendingCount,
      queuedTransactions: queuedCount
    };
  }

  /**
   * Collect and save mempool data
   */
  public async collectAndSave(): Promise<void> {
    console.log('📊 Collecting mempool data...');
    
    const mempoolData = await this.makeApiRequest();
    
    if (!mempoolData) {
      console.log('❌ Failed to fetch mempool data');
      return;
    }

    const timestamp = new Date();
    const timestampStr = timestamp.toISOString();
    
    // Count transactions
    const txCounts = this.countTransactions(mempoolData);
    
    // Create summary
    const summary = {
      pendingAddresses: Object.keys(mempoolData.pending || {}).length,
      queuedAddresses: Object.keys(mempoolData.queued || {}).length,
      totalAddresses: Object.keys(mempoolData.pending || {}).length + Object.keys(mempoolData.queued || {}).length,
      pendingTransactions: txCounts.pendingTransactions,
      queuedTransactions: txCounts.queuedTransactions,
      totalTransactions: txCounts.pendingTransactions + txCounts.queuedTransactions
    };

    // Create data structure
    const dataFile: MempoolDataFile = {
      timestamp: timestampStr,
      mempoolData,
      summary,
      metadata: {
        apiUrl: this.apiUrl,
        collectionTime: timestampStr,
        version: '1.0.0'
      }
    };

    // Generate filename with timestamp
    const filename = `mempool-${timestamp.toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(this.resultDir, filename);

    // Save to file
    try {
      fs.writeFileSync(filepath, JSON.stringify(dataFile, null, 2));
      
      console.log(`✅ Mempool data saved to: ${filepath}`);
      console.log(`📈 Summary:`);
      console.log(`   Pending addresses: ${summary.pendingAddresses}`);
      console.log(`   Queued addresses: ${summary.queuedAddresses}`);
      console.log(`   Pending transactions: ${summary.pendingTransactions}`);
      console.log(`   Queued transactions: ${summary.queuedTransactions}`);
      console.log(`   Total transactions: ${summary.totalTransactions}`);
      
    } catch (error) {
      console.error(`❌ Failed to save file: ${error}`);
    }
  }

  /**
   * Collect data continuously
   */
  public async startContinuousCollection(intervalMs: number = 1000): Promise<void> {
    console.log(`🔄 Starting continuous collection (interval: ${intervalMs}ms)`);
    this.isRunning = true;

    // Setup graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping collection...');
      this.isRunning = false;
      process.exit(0);
    });

    try {
      while (this.isRunning) {
        await this.collectAndSave();
        await this.sleep(intervalMs);
      }
    } catch (error) {
      console.error(`❌ Collection error: ${error}`);
    }
  }

  /**
   * Collect data once and exit
   */
  public async collectOnce(): Promise<void> {
    await this.collectAndSave();
  }

  /**
   * List all collected files
   */
  public listCollectedFiles(): void {
    try {
      const files = fs.readdirSync(this.resultDir)
        .filter(file => file.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first

      console.log(`📁 Collected files in ${this.resultDir}:`);
      if (files.length === 0) {
        console.log('   No files found');
        return;
      }

      files.forEach((file, index) => {
        const filepath = path.join(this.resultDir, file);
        const stats = fs.statSync(filepath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        console.log(`   ${index + 1}. ${file} (${sizeKB} KB)`);
      });
    } catch (error) {
      console.error(`❌ Failed to list files: ${error}`);
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
function parseArgs(): {
  apiUrl: string;
  resultDir: string;
  mode: 'once' | 'continuous';
  interval: number;
} {
  const args = process.argv.slice(2);
  let apiUrl = 'http://0.0.0.0:26545';
  let resultDir = './result';
  let mode: 'once' | 'continuous' = 'once';
  let interval = 1000; // 1 second

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--api-url':
      case '-a':
        apiUrl = args[++i];
        break;
      case '--result-dir':
      case '-r':
        resultDir = args[++i];
        break;
      case '--mode':
      case '-m':
        mode = args[++i] as 'once' | 'continuous';
        break;
      case '--interval':
      case '-i':
        interval = parseInt(args[++i]);
        break;
      case '--list':
      case '-l':
        const collector = new MempoolCollector(apiUrl, resultDir);
        collector.listCollectedFiles();
        process.exit(0);
        break;
      case '--help':
      case '-h':
        displayHelp();
        process.exit(0);
        break;
    }
  }

  return { apiUrl, resultDir, mode, interval };
}

/**
 * Display help information
 */
function displayHelp(): void {
  console.log(`
Usage: npm run collect [options]

Options:
  --api-url, -a       JSON-RPC API endpoint URL (default: http://0.0.0.0:26545)
  --result-dir, -r    Result directory for JSON files (default: ./result)
  --mode, -m          Collection mode: once, continuous (default: once)
  --interval, -i      Collection interval in ms for continuous mode (default: 1000)
  --list, -l          List all collected files
  --help, -h          Show this help message

Examples:
  npm run collect                                    # Collect once
  npm run collect -- --mode continuous --interval 5000  # Collect every 5 seconds
  npm run collect -- --api-url http://localhost:8545    # Use different API
  npm run collect -- --list                           # List collected files
`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    const { apiUrl, resultDir, mode, interval } = parseArgs();
    const collector = new MempoolCollector(apiUrl, resultDir);

    if (mode === 'once') {
      await collector.collectOnce();
    } else {
      await collector.startContinuousCollection(interval);
    }
  } catch (error) {
    console.error(`❌ Fatal error: ${error}`);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main();
}
