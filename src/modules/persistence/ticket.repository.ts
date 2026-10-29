import { Injectable } from '@nitrostack/core';
import { MongoService } from './mongo.service.js';
import { getDefaultSeedTicket, getHemantSeedTicket, type SeedTicketContext } from './seed-data.js';

@Injectable({ deps: [MongoService] })
export class TicketRepository {
  private memoryStore: Map<string, SeedTicketContext> = new Map();

  constructor(private readonly mongoService?: MongoService) {
    const defaultTicket = getDefaultSeedTicket();
    this.memoryStore.set(defaultTicket.ticketId, defaultTicket);
    const hemantTicket = getHemantSeedTicket();
    this.memoryStore.set(hemantTicket.ticketId, hemantTicket);
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

  /** Every ticket in Mongo when Atlas is up, otherwise the in-memory map. Does not invent tickets. */
  async listTickets(): Promise<SeedTicketContext[]> {
    const merged = new Map<string, SeedTicketContext>();
    for (const ticket of this.memoryStore.values()) {
      if (ticket.ticketId) merged.set(ticket.ticketId, ticket);
    }

    if (this.mongoService?.isOnline()) {
      try {
        const col = this.mongoService.getCollection('tickets');
        if (col) {
          const docs = await col.find({}).toArray();
          for (const doc of docs) {
            const id = String(doc.ticketId || '').trim();
            if (!id) continue;
            const ticket = { ...(merged.get(id) || {}), ...doc, ticketId: id } as SeedTicketContext;
            merged.set(id, ticket);
            this.memoryStore.set(id, ticket);
          }
        }
      } catch (err: any) {
        console.warn(`[repository] Error listing tickets from Atlas: ${err.message}. Using cache.`);
      }
    }

    return [...merged.values()];
  }

  async findTicketByIdentifier(identifier: string): Promise<SeedTicketContext | null> {
    const raw = String(identifier || '').trim();
    if (!raw) return null;
    const norm = raw.toLowerCase();
    const digits = norm.replace(/\D/g, '');

    if (this.mongoService?.isOnline()) {
      try {
        const col = this.mongoService.getCollection('tickets');
        if (col) {
          const conditions: any[] = [
            { recipientEmail: norm },
            { customerEmail: norm },
            { customerPhone: raw },
            { customerPhone: norm },
          ];
          if (digits.length >= 10) {
            conditions.push({ customerPhone: { $regex: digits.slice(-10) } });
          }
          const doc = await col.findOne({ $or: conditions });
          if (doc) {
            const merged = { ...this.getFallbackTicket(doc.ticketId || 'HQ-DEMO-001'), ...doc } as SeedTicketContext;
            this.memoryStore.set(merged.ticketId, merged);
            return merged;
          }
        }
      } catch (err: any) {
        console.warn(`[repository] Error finding ticket by identifier ${identifier}: ${err.message}`);
      }
    }

    for (const ticket of this.memoryStore.values()) {
      if (
        ticket.recipientEmail?.toLowerCase() === norm ||
        ticket.customerPhone === raw ||
        (digits.length >= 10 && ticket.customerPhone?.replace(/\D/g, '').includes(digits.slice(-10)))
      ) {
        return ticket;
      }
    }

    const defaultTicket = this.getFallbackTicket('HQ-DEMO-001');
    if (
      defaultTicket.recipientEmail?.toLowerCase() === norm ||
      (digits.length >= 10 && defaultTicket.customerPhone?.replace(/\D/g, '').includes(digits.slice(-10)))
    ) {
      return defaultTicket;
    }

    return null;
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
