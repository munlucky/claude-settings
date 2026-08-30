import { createHash } from 'node:crypto';
import path from 'node:path';
import { makeId } from './constants.mjs';
import { atomicWriteText } from './durable-write.mjs';
import { receiptsPath } from './paths.mjs';
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function createReceipt({ operation, status, surface, runtime = 'moon-relay-kernel', effective = {}, errorCode = null, managedStaticHashes = [] } = {}) {
  const receipt = { schemaVersion: 1, receiptId: makeId('receipt'), operation, status, surface, runtime, effective, errorCode, sensitiveContentRead: false, managedStaticHashes, receiptDigest: null };
  receipt.receiptDigest = digest({ ...receipt, receiptDigest: null });
  await atomicWriteText(path.join(receiptsPath(), `${receipt.receiptId}.json`), JSON.stringify(receipt, null, 2));
  return receipt;
}
