import { Injectable } from '@nitrostack/core';
import { MongoService } from './mongo.service.js';
import { getDefaultSeedTicket, type SeedTicketContext } from './seed-data.js';

@Injectable({ deps: [MongoService] })
export class TicketRepository {
  private memoryStore: Map<string, SeedTicketContext> = new Map();

  constructor(private readonly mongoService?: MongoService) {
    const defaultTicket = getDefaultSeedTicket();
    this.memoryStore.set(defaultTicket.ticketId, defaultTicket);
  }

  async getTicketContext(ticketId: string): Promise<SeedTicketContext> {
    const id = ticketId || 'HQ-DEMO-001';

    if (this.mongoService?.isOnline()) {
      try {
        const col = this.mongoService.getCollection('tickets');
        if (col) {
          const doc = await col.findOne({ ticketId: id });
          if (doc) {
            const merged = { ...this.getFallbackTicket(id), ...doc } as SeedTicketContext;
            this.memoryStore.set(id, merged);
            return merged;
          }
        }
      } catch (err: any) {
        console.warn(`[repository] Error fetching ticket ${id} from Atlas: ${err.message}. Using cache.`);
      }
    }

    return this.getFallbackTicket(id);
  }

  async updateTicket(ticketId: string, updates: Partial<SeedTicketContext>): Promise<SeedTicketContext> {
    const id = ticketId || 'HQ-DEMO-001';
    const current = await this.getTicketContext(id);
    const updated = { ...current, ...updates };
    this.memoryStore.set(id, updated);

    if (this.mongoService?.isOnline()) {
      try {
        const col = this.mongoService.getCollection('tickets');
        if (col) {
          await col.updateOne({ ticketId: id }, { $set: updates }, { upsert: true });
        }
      } catch (err: any) {
        console.warn(`[repository] Error persisting updates to Atlas: ${err.message}. Cached in memory.`);
      }
    }

    return updated;
  }

  async appendConversationTurn(ticketId: string, role: string, content: string): Promise<void> {
    const id = ticketId || 'HQ-DEMO-001';
    const turn = { role, content, timestamp: new Date().toISOString() };

    const ticket = await this.getTicketContext(id);
    if (!ticket.conversations) ticket.conversations = [];
    ticket.conversations.push(turn);
    this.memoryStore.set(id, ticket);

    if (this.mongoService?.isOnline()) {
      try {
        const col = this.mongoService.getCollection('tickets');
        if (col) {
          await col.updateOne({ ticketId: id }, { $push: { conversations: turn } } as any);
        }
      } catch (err: any) {
        console.warn(`[repository] Failed to append turn to Atlas: ${err.message}`);
      }
    }
  }

  async createHitlTask(task: {
    taskId: string;
    ticketId: string;
    type: string;
    status: string;
    metadata: Record<string, any>;
  }): Promise<void> {
    if (this.mongoService?.isOnline()) {
      try {
        const col = this.mongoService.getCollection('hitl_tasks');
        if (col) {
          await col.insertOne({ ...task, createdAt: new Date() });
        }
      } catch (err: any) {
        console.warn(`[repository] Failed to log HITL task to Atlas: ${err.message}`);
      }
    }
  }

  private getFallbackTicket(id: string): SeedTicketContext {
    if (!this.memoryStore.has(id)) {
      const def = getDefaultSeedTicket();
      def.ticketId = id;
      this.memoryStore.set(id, def);
    }
    return this.memoryStore.get(id)!;
  }
}
