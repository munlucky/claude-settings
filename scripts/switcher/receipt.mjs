import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makeId } from './constants.mjs';
import { receiptsPath } from './paths.mjs';
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function createReceipt({ operation, status, surface, track = 'unknown', effective = {}, errorCode = null, managedStaticHashes = [] } = {}) {
  const receipt = { schemaVersion: 1, receiptId: makeId('receipt'), operation, status, surface, track, effective, errorCode, sensitiveContentRead: false, managedStaticHashes, receiptDigest: null };
  receipt.receiptDigest = digest({ ...receipt, receiptDigest: null });
  await mkdir(receiptsPath(), { recursive: true });
  await writeFile(path.join(receiptsPath(), `${receipt.receiptId}.json`), JSON.stringify(receipt, null, 2), 'utf8');
  return receipt;
}
