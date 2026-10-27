import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function seed() {
  console.log('--- Seeding HoneyQuote Demo Data into MongoDB Atlas ---');
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || 'hq_demo';

  if (!uri) {
    console.error('❌ MONGODB_URI not found in environment.');
    process.exit(1);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(dbName);

  const customerPhone = process.env.TWILIO_DEFAULT_PHONE || process.env.DEFAULT_CUSTOMER_PHONE || '+919503760623';
  const customerEmail = process.env.DEMO_CUSTOMER_EMAIL || 'hemantj@wekancode.com';

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const renewalDate = '2026-11-09';
  const effectiveDate = '2025-10-27';

  const demoTicket = {
    ticketId: 'HQ-DEMO-001',
    subject: 'Homeowners Policy Servicing & Renewal — Jordan Mitchell',
    status: 'active',
    policyNumber: 'HQ-POL-88421',
    carrier: 'Citizens',
    customerName: 'Jordan Mitchell',
    customerPhone: customerPhone,
    recipientEmail: customerEmail,
    customerEmail: customerEmail,
    userId: '6ad9bd5dcfc164fb5ece28e1',
    propertyAddress: '1244 Ocean Drive, Miami Beach, FL 33139',
    billedToMortgage: false,
    effectiveDate,
    renewalDate,
    daysUntilExpiry: 13,
    isRenewalEligible: true,
    policyStatus: 'active',
    paymentStatus: 'UNPAID',
    signatureRequired: false,
    esignSent: false,
    signatureStatus: 'NOT_SENT',
    missingDocuments: ['application', 'supplemental_signature_page'],
    coverages: {
      dwelling: 350000,
      personalProperty: 175000,
      lossOfUse: 70000,
      liability: 300000,
      medicalPayments: 5000,
    },
    deductibles: {
      hurricane: 2500,
      hurricanePercentage: '2%',
      allOtherPerils: 1000,
      aop: 1000,
    },
    propertyAttributes: {
      address: '1244 Ocean Drive, Miami Beach, FL 33139',
      yearBuilt: 2018,
      squareFootage: 2450,
      constructionType: 'Reinforced Masonry / Concrete',
      roofType: 'Concrete Tile',
      roofGeometry: 'Hip Roof',
      roofYear: 2018,
      stories: 2,
      primaryUse: 'Single Family Residence (Owner Occupied)',
      primaryHeating: 'Central',
      plumbingSystem: 'Copper',
      electricalPanel: 'CircuitBreaker',
    },
    conversations: [],
    paymentTransactions: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const omniTicket = {
    ticketId: 'TKT-OMNI-2026-001',
    subject: 'Binding follow-up — customer texting about proof of purchase',
    status: 'open',
    customerName: 'Priya Raman',
    policyNumber: 'POL-HQ-2026-8841',
    carrier: 'Citizens',
    billedToMortgage: false,
    customerPhone: '+15551234567',
    recipientEmail: 'insured@example.com',
    customerEmail: 'insured@example.com',
    preferredChannel: 'text',
    signatureRequired: false,
    missingDocuments: ['proof_of_new_purchase'],
    esignSent: false,
    conversations: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await db.collection('tickets').createIndex({ ticketId: 1 }, { unique: true });
  await db.collection('tickets').createIndex({ customerPhone: 1 });
  await db.collection('tickets').createIndex({ recipientEmail: 1 });

  for (const t of [demoTicket, omniTicket]) {
    await db.collection('tickets').replaceOne({ ticketId: t.ticketId }, t, { upsert: true });
    await db.collection('envelopes').deleteMany({ ticketId: t.ticketId });
    await db.collection('outbox').deleteMany({ ticketId: t.ticketId });
    await db.collection('conversations').deleteMany({ ticketId: t.ticketId });
    await db.collection('activity').deleteMany({ ticketId: t.ticketId });
  }

  const seeded = await db
    .collection('tickets')
    .find({}, { projection: { _id: 0, ticketId: 1, customerName: 1, customerPhone: 1, status: 1 } })
    .toArray();

  console.log('\n✅ Successfully seeded demo tickets in MongoDB Atlas (hq_demo):');
  console.table(seeded);

  await client.close();
  console.log('Database connection closed.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
