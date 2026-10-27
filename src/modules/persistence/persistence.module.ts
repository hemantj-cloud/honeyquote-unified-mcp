import { Module } from '@nitrostack/core';
import { MongoService } from './mongo.service.js';
import { TicketRepository } from './ticket.repository.js';

@Module({
  name: 'persistence',
  description: 'Direct MongoDB Atlas persistence layer with zero-failure memory fallback',
  providers: [MongoService, TicketRepository],
  exports: [MongoService, TicketRepository],
})
export class PersistenceModule {}
