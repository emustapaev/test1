import { createHash } from 'node:crypto';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

// v1 does not fix numeric thresholds; defaults are overridable via env.
const LIMIT = () => Number(process.env.RATE_LIMIT_MAX ?? 5);
const WINDOW_SECONDS = () => Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 600);

export function ipKey(ip: string): string {
  return `ip#${createHash('sha256').update(ip).digest('hex')}`;
}

/** Atomically increments the per-IP counter; returns true if the request is allowed. */
export async function checkRateLimit(ip: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const windowSec = WINDOW_SECONDS();
  const res = await client.send(
    new UpdateItemCommand({
      TableName: process.env.RATE_LIMIT_TABLE,
      Key: { pk: { S: ipKey(ip) } },
      UpdateExpression: 'ADD #c :one SET expiresAt = if_not_exists(expiresAt, :exp)',
      ExpressionAttributeNames: { '#c': 'count' },
      ExpressionAttributeValues: { ':one': { N: '1' }, ':exp': { N: String(nowSeconds + windowSec) } },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  const count = Number(res.Attributes?.count?.N ?? 1);
  return count <= LIMIT();
}
