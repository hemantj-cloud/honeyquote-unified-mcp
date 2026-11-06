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
    customerPhone: process.env.JORDAN_PHONE || '+13055550199',
    recipientEmail: 'jordan.mitchell@example.com',
    customerEmail: 'jordan.mitchell@example.com',
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

  const navarathinamTicket = {
    ticketId: 'HQ-DEMO-002',
    subject: 'New business binding — signature outstanding',
    status: 'new',
    customerName: 'Navarathinam C',
    policyNumber: 'HQ-POL-88422',
    carrier: 'Citizens',
    billedToMortgage: true,
    recipientEmail: 'navarathinamc@wekancode.com',
    customerEmail: 'navarathinamc@wekancode.com',
    customerPhone: '+918695952729',
    mortgageeEmail: 'escrow@examplemortgage.com',
    userId: '6ad9bd5dcfc164fb5ece28e1',
    propertyAddress: '48 Palm Island Drive, Miami Beach, FL 33139',
    propertyAttributes: {
      address: '48 Palm Island Drive, Miami Beach, FL 33139',
      yearBuilt: 2010,
      squareFootage: 1850,
      constructionType: 'Concrete Block / Stucco',
      roofType: 'Barrel Tile',
      roofGeometry: 'Gable Roof',
      roofYear: 2015,
      stories: 1,
      primaryUse: 'Single Family Residence (Owner Occupied)',
      primaryHeating: 'Central',
      plumbingSystem: 'Copper',
      electricalPanel: 'CircuitBreaker',
    },
    effectiveDate: '2025-10-28',
    renewalDate: '2026-11-14',
    daysUntilExpiry: 17,
    isRenewalEligible: true,
    policyStatus: 'active',
    paymentStatus: 'UNPAID',
    coverages: {
      dwelling: 420000,
      personalProperty: 210000,
      lossOfUse: 84000,
      liability: 300000,
      medicalPayments: 5000,
    },
    deductibles: {
      hurricane: 2500,
      hurricanePercentage: '2%',
      allOtherPerils: 1000,
    },
    signatureRequired: true,
    esignSent: false,
    signatureStatus: 'pending',
    missingDocuments: ['application', 'supplemental_signature_page'],
    renewalPremium: 2120,
    conversations: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const hemantTicket = {
    ticketId: 'HQ-DEMO-003',
    subject: 'New business binding — signature outstanding',
    status: 'new',
    customerName: 'Hemant Jadhav',
    policyNumber: 'HQ-POL-88423',
    carrier: 'Citizens',
    billedToMortgage: true,
    recipientEmail: 'hemantj@wekan.company',
    customerEmail: 'hemantj@wekan.company',
    customerPhone: customerPhone,
    mortgageeEmail: 'escrow@examplemortgage.com',
    userId: '6ad9bd5dcfc164fb5ece28e1',
    propertyAddress: '2310 Coral Way, Coral Gables, FL 33145',
    propertyAttributes: {
      address: '2310 Coral Way, Coral Gables, FL 33145',
      yearBuilt: 2004,
      squareFootage: 2100,
      constructionType: 'Reinforced Masonry / Concrete',
      roofType: 'Concrete Tile',
      roofGeometry: 'Hip Roof',
      roofYear: 2020,
      stories: 2,
      primaryUse: 'Single Family Residence (Owner Occupied)',
      primaryHeating: 'Central',
      plumbingSystem: 'Copper',
      electricalPanel: 'CircuitBreaker',
    },
    effectiveDate: '2025-10-28',
    renewalDate: '2026-11-19',
    daysUntilExpiry: 22,
    isRenewalEligible: true,
    policyStatus: 'active',
    paymentStatus: 'UNPAID',
    coverages: {
      dwelling: 510000,
      personalProperty: 255000,
      lossOfUse: 102000,
      liability: 500000,
      medicalPayments: 5000,
    },
    deductibles: {
      hurricane: 2500,
      hurricanePercentage: '2%',
      allOtherPerils: 1000,
    },
    signatureRequired: true,
    esignSent: false,
    signatureStatus: 'pending',
    missingDocuments: ['application', 'supplemental_signature_page'],
    renewalPremium: 2485,
    conversations: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const arpanTicket = {
    ticketId: 'HQ-DEMO-004',
    subject: 'New business binding — signature outstanding',
    status: 'new',
    customerName: 'Arpan M',
    policyNumber: 'HQ-POL-88424',
    carrier: 'Citizens',
    billedToMortgage: true,
    recipientEmail: 'arpanm@wekan.company',
    customerEmail: 'arpanm@wekan.company',
    customerPhone: '+918335012464',
    mortgageeEmail: 'escrow@examplemortgage.com',
    userId: '6ad9bd5dcfc164fb5ece28e1',
    propertyAddress: '7721 Collins Ave Apt 9C, Miami Beach, FL 33141',
    propertyAttributes: {
      address: '7721 Collins Ave Apt 9C, Miami Beach, FL 33141',
      yearBuilt: 1999,
      squareFootage: 1200,
      constructionType: 'Reinforced Concrete High-Rise',
      roofType: 'Flat Membrane',
      roofGeometry: 'Flat Roof',
      roofYear: 2019,
      stories: 1,
      primaryUse: 'Condominium (Owner Occupied)',
      primaryHeating: 'Central',
      plumbingSystem: 'Copper',
      electricalPanel: 'CircuitBreaker',
    },
    effectiveDate: '2025-10-28',
    renewalDate: '2026-11-23',
    daysUntilExpiry: 26,
    isRenewalEligible: true,
    policyStatus: 'active',
    paymentStatus: 'UNPAID',
    coverages: {
      dwelling: 260000,
      personalProperty: 130000,
      lossOfUse: 52000,
      liability: 300000,
      medicalPayments: 5000,
    },
    deductibles: {
      hurricane: 2500,
      hurricanePercentage: '2%',
      allOtherPerils: 1000,
    },
    signatureRequired: true,
    esignSent: false,
    signatureStatus: 'pending',
    missingDocuments: ['application', 'supplemental_signature_page'],
    renewalPremium: 1590,
    conversations: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const navaTicket = {
    ticketId: 'HQ-DEMO-005',
    subject: 'New business binding — signature outstanding',
    status: 'new',
    customerName: 'Nava',
    policyNumber: 'HQ-POL-88425',
    carrier: 'Citizens',
    billedToMortgage: true,
    recipientEmail: 'cnavarathinam@gmail.com',
    customerEmail: 'cnavarathinam@gmail.com',
    customerPhone: '+918939138620',
    mortgageeEmail: 'escrow@examplemortgage.com',
    userId: '6ad9bd5dcfc164fb5ece28e1',
    propertyAddress: '4100 Alton Rd, Miami Beach, FL 33140',
    propertyAttributes: {
      address: '4100 Alton Rd, Miami Beach, FL 33140',
      yearBuilt: 2008,
      squareFootage: 1680,
      constructionType: 'Concrete Block / Stucco',
      roofType: 'Concrete Tile',
      roofGeometry: 'Hip Roof',
      roofYear: 2017,
      stories: 2,
      primaryUse: 'Single Family Residence (Owner Occupied)',
      primaryHeating: 'Central',
      plumbingSystem: 'Copper',
      electricalPanel: 'CircuitBreaker',
    },
    effectiveDate: '2025-10-28',
    renewalDate: '2026-11-28',
    daysUntilExpiry: 31,
    isRenewalEligible: true,
    policyStatus: 'active',
    paymentStatus: 'UNPAID',
    coverages: {
      dwelling: 385000,
      personalProperty: 192500,
      lossOfUse: 77000,
      liability: 300000,
      medicalPayments: 5000,
    },
    deductibles: {
      hurricane: 2500,
      hurricanePercentage: '2%',
      allOtherPerils: 1000,
    },
    signatureRequired: true,
    esignSent: false,
    signatureStatus: 'pending',
    missingDocuments: ['application', 'supplemental_signature_page'],
    renewalPremium: 1875,
    conversations: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const chetanTicket = {
    ticketId: 'HQ-DEMO-006',
    subject: 'New business binding — signature outstanding',
    status: 'new',
    customerName: 'Chetan K',
    policyNumber: 'HQ-POL-88426',
    carrier: 'Citizens',
    billedToMortgage: true,
    recipientEmail: 'chetank@wekan.company',
    customerEmail: 'chetank@wekan.company',
    customerPhone: '+916380430179',
    mortgageeEmail: 'escrow@examplemortgage.com',
    userId: '6ad9bd5dcfc164fb5ece28e1',
    propertyAddress: '920 South Pointe Dr, Miami Beach, FL 33139',
    propertyAttributes: {
      address: '920 South Pointe Dr, Miami Beach, FL 33139',
      yearBuilt: 2012,
      squareFootage: 1950,
      constructionType: 'Concrete Block / Stucco',
      roofType: 'Concrete Tile',
      roofGeometry: 'Hip Roof',
      roofYear: 2021,
      stories: 2,
      primaryUse: 'Single Family Residence (Owner Occupied)',
      primaryHeating: 'Central',
      plumbingSystem: 'Copper',
      electricalPanel: 'CircuitBreaker',
    },
    effectiveDate: '2025-10-28',
    renewalDate: '2026-12-02',
    daysUntilExpiry: 26,
    isRenewalEligible: true,
    policyStatus: 'active',
    paymentStatus: 'UNPAID',
    coverages: {
      dwelling: 440000,
      personalProperty: 220000,
      lossOfUse: 88000,
      liability: 300000,
      medicalPayments: 5000,
    },
    deductibles: {
      hurricane: 2500,
      hurricanePercentage: '2%',
      allOtherPerils: 1000,
    },
    signatureRequired: true,
    esignSent: false,
    signatureStatus: 'pending',
    missingDocuments: ['application', 'supplemental_signature_page'],
    renewalPremium: 2140,
    conversations: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await db.collection('tickets').createIndex({ ticketId: 1 }, { unique: true });
  await db.collection('tickets').createIndex({ customerPhone: 1 });
  await db.collection('tickets').createIndex({ recipientEmail: 1 });

  const seedTickets = [
    demoTicket,
    omniTicket,
    navarathinamTicket,
    hemantTicket,
    arpanTicket,
    navaTicket,
    chetanTicket,
  ];

  for (const t of seedTickets) {
    await db.collection('tickets').replaceOne({ ticketId: t.ticketId }, t, { upsert: true });
    await db.collection('envelopes').deleteMany({ ticketId: t.ticketId });
    await db.collection('outbox').deleteMany({ ticketId: t.ticketId });
    await db.collection('conversations').deleteMany({ ticketId: t.ticketId });
    await db.collection('activity').deleteMany({ ticketId: t.ticketId });
    await db.collection('signingLinks').deleteMany({ ticketId: t.ticketId });
    await db.collection('hitl_tasks').deleteMany({ ticketId: t.ticketId });
    await db.collection('tasks').deleteMany({ ticketId: t.ticketId });
    await db.collection('otp_challenges').deleteMany({ identifier: t.customerPhone });
  }

  // Clean up stale or duplicate OTP challenges for all seeded phones
  for (const t of seedTickets) {
    await db.collection('otp_challenges').deleteMany({
      $or: [
        { identifier: t.customerPhone },
        { identifier: t.customerEmail },
        { identifier: t.recipientEmail },
      ].filter(Boolean),
    });
  }

  // Remove duplicate tickets or numbers if any exist in the database
  const canonicalIds = new Set(seedTickets.map((t) => t.ticketId));
  const seenPhones = new Map<string, string>(); // digits -> ticketId
  for (const t of seedTickets) {
    const rawDigits = String(t.customerPhone || '').replace(/\D/g, '').slice(-10);
    if (rawDigits) seenPhones.set(rawDigits, t.ticketId);
  }

  const allTickets = await db.collection('tickets').find({}).toArray();
  for (const t of allTickets) {
    if (!canonicalIds.has(t.ticketId)) {
      const rawDigits = String(t.customerPhone || '').replace(/\D/g, '').slice(-10);
      if (!rawDigits || seenPhones.has(rawDigits)) {
        console.log(`🗑️ Removing duplicate/unregistered ticket from database: ${t.ticketId} (${t.customerName}: ${t.customerPhone})`);
        await db.collection('tickets').deleteOne({ _id: t._id });
        continue;
      }
      seenPhones.set(rawDigits, t.ticketId);
    }
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
