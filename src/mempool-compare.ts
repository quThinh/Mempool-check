#!/usr/bin/env node

/**
 * Mempool Comparison Tool
 * Compares two mempool JSON files and finds transactions that appeared in the first
 * but disappeared in the second (i.e., were processed/removed)
 */

import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { MempoolResult, MempoolTransaction } from './types';

interface TransactionInfo {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasPrice: string;
  nonce: string;
  poolType: 'pending' | 'queued';
  address: string;
}

interface ComparisonResult {
  disappearedTransactions: TransactionInfo[];
  newTransactions: TransactionInfo[];
  stillPending: TransactionInfo[];
  movedToQueued: TransactionInfo[];
  movedToPending: TransactionInfo[];
  summary: {
    totalDisappeared: number;
    totalNew: number;
    totalStillPending: number;
    totalMovedToQueued: number;
    totalMovedToPending: number;
    firstFileTime: string;
    secondFileTime: string;
  };
}

class MempoolComparator {
  /**
   * Extract all transactions from mempool data
   */
  private extractAllTransactions(mempoolData: MempoolResult): TransactionInfo[] {
    const transactions: TransactionInfo[] = [];

    // Extract pending transactions
    for (const [address, addressData] of Object.entries(mempoolData.pending || {})) {
      for (const [nonce, tx] of Object.entries(addressData)) {
        transactions.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value,
          gasPrice: tx.gasPrice,
          nonce,
          poolType: 'pending',
          address
        });
      }
    }

    // Extract queued transactions
    for (const [address, addressData] of Object.entries(mempoolData.queued || {})) {
      for (const [nonce, tx] of Object.entries(addressData)) {
        transactions.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value,
          gasPrice: tx.gasPrice,
          nonce,
          poolType: 'queued',
          address
        });
      }
    }

    return transactions;
  }

  /**
   * Load and parse mempool JSON file
   */
  private loadMempoolFile(filePath: string): { data: MempoolResult; timestamp: string } {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(fileContent);
      
      return {
        data: parsed.mempoolData,
        timestamp: parsed.timestamp
      };
    } catch (error) {
      throw new Error(`Failed to load file ${filePath}: ${error}`);
    }
  }

  /**
   * Compare two mempool files
   */
  public compareFiles(firstFile: string, secondFile: string): ComparisonResult {
    console.log(`📊 Comparing mempool files:`);
    console.log(`   First file: ${firstFile}`);
    console.log(`   Second file: ${secondFile}`);

    // Load both files
    const firstMempool = this.loadMempoolFile(firstFile);
    const secondMempool = this.loadMempoolFile(secondFile);

    console.log(`   First file timestamp: ${firstMempool.timestamp}`);
    console.log(`   Second file timestamp: ${secondMempool.timestamp}`);

    // Extract transactions from both files
    const firstTransactions = this.extractAllTransactions(firstMempool.data);
    const secondTransactions = this.extractAllTransactions(secondMempool.data);

    // Create maps for quick lookup
    const firstTxMap = new Map(firstTransactions.map(tx => [tx.hash, tx]));
    const secondTxMap = new Map(secondTransactions.map(tx => [tx.hash, tx]));

    // Find disappeared transactions (in first but not in second)
    const disappearedTransactions: TransactionInfo[] = [];
    const stillPending: TransactionInfo[] = [];
    const movedToQueued: TransactionInfo[] = [];
    const movedToPending: TransactionInfo[] = [];

    for (const tx of firstTransactions) {
      if (!secondTxMap.has(tx.hash)) {
        // Transaction completely disappeared
        disappearedTransactions.push(tx);
      } else {
        const secondTx = secondTxMap.get(tx.hash)!;
        if (tx.poolType === secondTx.poolType) {
          // Still in same pool
          stillPending.push(tx);
        } else if (tx.poolType === 'pending' && secondTx.poolType === 'queued') {
          // Moved from pending to queued
          movedToQueued.push(tx);
        } else if (tx.poolType === 'queued' && secondTx.poolType === 'pending') {
          // Moved from queued to pending
          movedToPending.push(tx);
        }
      }
    }

    // Find new transactions (in second but not in first)
    const newTransactions: TransactionInfo[] = [];
    for (const tx of secondTransactions) {
      if (!firstTxMap.has(tx.hash)) {
        newTransactions.push(tx);
      }
    }

    return {
      disappearedTransactions,
      newTransactions,
      stillPending,
      movedToQueued,
      movedToPending,
      summary: {
        totalDisappeared: disappearedTransactions.length,
        totalNew: newTransactions.length,
        totalStillPending: stillPending.length,
        totalMovedToQueued: movedToQueued.length,
        totalMovedToPending: movedToPending.length,
        firstFileTime: firstMempool.timestamp,
        secondFileTime: secondMempool.timestamp
      }
    };
  }

  /**
   * Display comparison results
   */
  public displayResults(result: ComparisonResult): void {
    console.log('\n' + '='.repeat(80));
    console.log('📈 COMPARISON RESULTS');
    console.log('='.repeat(80));

    console.log(`\n📊 Summary:`);
    console.log(`   Disappeared transactions: ${result.summary.totalDisappeared}`);
    console.log(`   New transactions: ${result.summary.totalNew}`);
    console.log(`   Still pending: ${result.summary.totalStillPending}`);
    console.log(`   Moved to queued: ${result.summary.totalMovedToQueued}`);
    console.log(`   Moved to pending: ${result.summary.totalMovedToPending}`);

    // Display disappeared transactions
    if (result.disappearedTransactions.length > 0) {
      console.log(`\n🚫 DISAPPEARED TRANSACTIONS (${result.disappearedTransactions.length}):`);
      console.log('-'.repeat(80));
      
      result.disappearedTransactions.forEach((tx, index) => {
        const valueEth = ethers.formatEther(tx.value);
        const gasPriceGwei = ethers.formatUnits(tx.gasPrice, 'gwei');
        
        console.log(`${index + 1}. Hash: ${tx.hash}`);
        console.log(`   From: ${tx.from}`);
        console.log(`   To: ${tx.to}`);
        console.log(`   Value: ${valueEth} ETH`);
        console.log(`   Gas Price: ${gasPriceGwei} Gwei`);
        console.log(`   Nonce: ${tx.nonce}`);
        console.log(`   Pool: ${tx.poolType}`);
        console.log(`   Address: ${tx.address}`);
        console.log('');
      });
    }

    // Display new transactions
    if (result.newTransactions.length > 0) {
      console.log(`\n🆕 NEW TRANSACTIONS (${result.newTransactions.length}):`);
      console.log('-'.repeat(80));
      
      result.newTransactions.slice(0, 10).forEach((tx, index) => { // Show first 10
        const valueEth = ethers.formatEther(tx.value);
        const gasPriceGwei = ethers.formatUnits(tx.gasPrice, 'gwei');
        
        console.log(`${index + 1}. Hash: ${tx.hash}`);
        console.log(`   From: ${tx.from}`);
        console.log(`   To: ${tx.to}`);
        console.log(`   Value: ${valueEth} ETH`);
        console.log(`   Gas Price: ${gasPriceGwei} Gwei`);
        console.log(`   Nonce: ${tx.nonce}`);
        console.log(`   Pool: ${tx.poolType}`);
        console.log('');
      });

      if (result.newTransactions.length > 10) {
        console.log(`   ... and ${result.newTransactions.length - 10} more new transactions`);
      }
    }

    // Display moved transactions
    if (result.movedToQueued.length > 0) {
      console.log(`\n⬇️  MOVED TO QUEUED (${result.movedToQueued.length}):`);
      result.movedToQueued.slice(0, 5).forEach((tx, index) => {
        console.log(`${index + 1}. ${tx.hash} (${ethers.formatUnits(tx.gasPrice, 'gwei')} Gwei)`);
      });
    }

    if (result.movedToPending.length > 0) {
      console.log(`\n⬆️  MOVED TO PENDING (${result.movedToPending.length}):`);
      result.movedToPending.slice(0, 5).forEach((tx, index) => {
        console.log(`${index + 1}. ${tx.hash} (${ethers.formatUnits(tx.gasPrice, 'gwei')} Gwei)`);
      });
    }
  }

  /**
   * Save comparison results to JSON file
   */
  public saveResults(result: ComparisonResult, outputFile: string): void {
    try {
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
      console.log(`\n💾 Results saved to: ${outputFile}`);
    } catch (error) {
      console.error(`❌ Failed to save results: ${error}`);
    }
  }

  /**
   * List available mempool files in result directory
   */
  public listMempoolFiles(resultDir: string = './result'): string[] {
    try {
      if (!fs.existsSync(resultDir)) {
        console.log(`❌ Result directory not found: ${resultDir}`);
        return [];
      }

      const files = fs.readdirSync(resultDir)
        .filter(file => file.startsWith('mempool-') && file.endsWith('.json'))
        .sort()
        .map(file => path.join(resultDir, file));

      console.log(`📁 Available mempool files in ${resultDir}:`);
      files.forEach((file, index) => {
        const stats = fs.statSync(file);
        const sizeKB = (stats.size / 1024).toFixed(2);
        const filename = path.basename(file);
        console.log(`   ${index + 1}. ${filename} (${sizeKB} KB)`);
      });

      return files;
    } catch (error) {
      console.error(`❌ Failed to list files: ${error}`);
      return [];
    }
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): {
  firstFile?: string;
  secondFile?: string;
  resultDir: string;
  outputFile?: string;
  listFiles: boolean;
} {
  const args = process.argv.slice(2);
  let firstFile: string | undefined;
  let secondFile: string | undefined;
  let resultDir = './result';
  let outputFile: string | undefined;
  let listFiles = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--first':
      case '-f':
        firstFile = args[++i];
        break;
      case '--second':
      case '-s':
        secondFile = args[++i];
        break;
      case '--result-dir':
      case '-r':
        resultDir = args[++i];
        break;
      case '--output':
      case '-o':
        outputFile = args[++i];
        break;
      case '--list':
      case '-l':
        listFiles = true;
        break;
      case '--help':
      case '-h':
        displayHelp();
        process.exit(0);
        break;
    }
  }

  return { firstFile, secondFile, resultDir, outputFile, listFiles };
}

/**
 * Display help information
 */
function displayHelp(): void {
  console.log(`
Usage: npm run compare [options]

Options:
  --first, -f         First mempool file (or use --list to see available files)
  --second, -s        Second mempool file
  --result-dir, -r    Result directory to look for files (default: ./result)
  --output, -o        Output file for comparison results (optional)
  --list, -l          List available mempool files
  --help, -h          Show this help message

Examples:
  npm run compare -- --list                                    # List available files
  npm run compare -- --first file1.json --second file2.json   # Compare two files
  npm run compare -- --first file1.json --second file2.json --output results.json
  npm run compare -- -f ./result/mempool-1.json -s ./result/mempool-2.json
`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    const { firstFile, secondFile, resultDir, outputFile, listFiles } = parseArgs();
    const comparator = new MempoolComparator();

    if (listFiles) {
      comparator.listMempoolFiles(resultDir);
      return;
    }

    if (!firstFile || !secondFile) {
      console.error('❌ Error: Both --first and --second files are required');
      console.log('Use --list to see available files');
      displayHelp();
      process.exit(1);
    }

    // Check if files exist
    if (!fs.existsSync(firstFile)) {
      console.error(`❌ First file not found: ${firstFile}`);
      process.exit(1);
    }

    if (!fs.existsSync(secondFile)) {
      console.error(`❌ Second file not found: ${secondFile}`);
      process.exit(1);
    }

    // Compare files
    const result = comparator.compareFiles(firstFile, secondFile);
    
    // Display results
    comparator.displayResults(result);

    // Save results if output file specified
    if (outputFile) {
      comparator.saveResults(result, outputFile);
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
