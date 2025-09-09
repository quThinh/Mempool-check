# Mempool Monitor

A TypeScript script using ethers.js to monitor the mempool for transactions from a specific wallet address and track when they first appear.

## Features

- 🔍 Monitors mempool for specific wallet transactions using ethers.js
- ⏰ Tracks exact timestamp when transactions first appear
- 📊 Real-time monitoring with configurable intervals
- 🎯 Filters both pending and queued transactions
- 📝 Detailed transaction information display with proper formatting
- 🛑 Graceful shutdown with summary report
- 🔧 Full TypeScript support with proper types

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

## Usage

### Mempool Monitor (MEV Bot)
```bash
# Development mode
npm run dev -- --wallet 0xYourWalletAddress

# Production mode
npm run build
npm start -- --wallet 0xYourWalletAddress

# With private key for sending transactions
npm run dev -- --wallet 0xYourWalletAddress --private-key 0xabc123... --recipient 0xdef456...
```

### Mempool Data Collector
```bash
# Collect mempool data once
npm run collect

# Collect continuously every 5 seconds
npm run collect -- --mode continuous --interval 5000

# Use different API endpoint
npm run collect -- --api-url http://localhost:8545

# List all collected files
npm run collect -- --list
```

### Parameters

- `--wallet, -w` (required): The wallet address to monitor (must be a valid Ethereum address)
- `--api-url, -a`: JSON-RPC API endpoint URL (default: http://0.0.0.0:26545)
- `--interval, -i`: Check interval in seconds (default: 1.0)
- `--help, -h`: Show help message

## Example Output

```
🚀 Starting mempool monitor for wallet: 0x1234...5678
🌐 API Endpoint: http://0.0.0.0:26545
⏱️  Check interval: 1.0 seconds
============================================================

🆕 NEW TRANSACTION DETECTED!
⏰ First seen: 2024-01-15 14:30:25.123

        📄 Transaction Hash: 0xabcd...efgh
        🔢 Nonce: 42
        📍 Pool: pending
        ➡️  To: 0x9876...5432
        💰 Value: 1000000000000000000
        ⛽ Gas Price: 20000000000
----------------------------------------

[14:30:26] Monitoring... | Total wallet txs in mempool: 1 | New txs: 0
```

## Testing

1. Start the monitoring script:
```bash
npm run dev -- --wallet 0xYourWalletAddress
```

2. In another terminal or browser, make a transaction from your wallet

3. The script will immediately detect and display the transaction with its first appearance timestamp

4. Press `Ctrl+C` to stop monitoring and see a summary

## Development

### Watch Mode
```bash
npm run watch
```

This will compile TypeScript files automatically when changes are detected.

### Project Structure
```
src/
├── types.ts              # TypeScript type definitions
├── mempool-monitor.ts    # MEV bot monitoring logic
└── mempool-collector.ts  # Data collection script
```

## Notes

- The script uses ethers.js for proper Ethereum address validation and formatting
- Transaction hashes are used to track unique transactions
- The script handles both pending and queued transaction pools
- All timestamps are in ISO format with millisecond precision
- Full TypeScript support with proper type checking
