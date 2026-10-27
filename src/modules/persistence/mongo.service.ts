import { Injectable } from '@nitrostack/core';
import { MongoClient, Db, Collection } from 'mongodb';

@Injectable()
export class MongoService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnected = false;

  constructor() {
    this.connect().catch((err) => {
      console.warn('[mongo] Background connection error (falling back to memory):', err.message);
    });
  }

  async connect(): Promise<boolean> {
    if (this.isConnected && this.db) return true;

    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.log('[mongo] No MONGODB_URI configured; running in in-memory mode');
      return false;
    }

    try {
      const dbName = process.env.MONGODB_DB_NAME || 'hq_demo';
      this.client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });

      await this.client.connect();
      this.db = this.client.db(dbName);
      this.isConnected = true;
      console.log(`[mongo] Connected successfully to Atlas database: ${dbName}`);
      return true;
    } catch (err: any) {
      console.warn(`[mongo] Atlas connection failed: ${err.message}. Operating in resilient memory mode.`);
      this.isConnected = false;
      this.db = null;
      return false;
    }
  }

  getDb(): Db | null {
    return this.db;
  }

  getCollection<T extends import('mongodb').Document = any>(name: string): Collection<T> | null {
    return this.db ? this.db.collection<T>(name) : null;
  }

  isOnline(): boolean {
    return this.isConnected && this.db !== null;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      this.client = null;
      this.db = null;
    }
  }
}
