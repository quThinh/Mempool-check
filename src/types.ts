/**
 * Type definitions for mempool monitoring
 */

export interface MempoolTransaction {
  hash: string;
  nonce: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  data: string;
  v?: string;
  r?: string;
  s?: string;
  type?: string;
  accessList?: any[];
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface MempoolContent {
  [address: string]: {
    [nonce: string]: MempoolTransaction;
  };
}

export interface MempoolResult {
  pending: MempoolContent;
  queued: MempoolContent;
}

export interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result: MempoolResult;
}

export interface TransactionWithMetadata extends MempoolTransaction {
  poolType: 'pending' | 'queued';
  firstSeen: Date;
  nonce: string;
}

export interface MonitorConfig {
  apiUrl: string;
  walletAddress: string;
  checkInterval: number;

  privateKey?: string;
  targetTxHash?: string;
  gasPriceMultiplier?: number;
  recipientAddress?: string;
  sendValue?: string; // Amount to send in ETH
}

export interface MonitorStats {
  totalTransactionsSeen: number;
  walletTransactionsInMempool: number;
  newTransactionsThisCheck: number;
  startTime: Date;
}
