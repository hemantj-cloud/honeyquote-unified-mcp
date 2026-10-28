import { Module } from '@nitrostack/core';
import { PaymentService } from './payment.service.js';
import { PaymentTools } from './payment.tools.js';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { ServicingModule } from '../servicing/servicing.module.js';

@Module({
  name: 'payment',
  description: 'Stripe policy renewal payments, checkout session generation, and binding verification',
  imports: [PersistenceModule, ServicingModule],
  controllers: [PaymentTools],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
