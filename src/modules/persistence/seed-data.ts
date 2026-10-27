export interface SeedTicketContext {
  ticketId: string;
  policyNumber: string;
  carrier: string;
  status: string;
  customerName: string;
  customerPhone: string;
  recipientEmail: string;
  userId: string;
  paymentStatus?: string;
  billedToMortgage: boolean;
  effectiveDate: string;
  renewalDate: string;
  daysUntilExpiry: number;
  coverages: {
    dwelling: number;
    personalProperty: number;
    lossOfUse: number;
    liability: number;
    medicalPayments: number;
  };
  deductibles: {
    hurricane: number;
    hurricanePercentage: string;
    allOtherPerils: number;
    aop?: number;
  };
  signatureRequired: boolean;
  esignSent: boolean;
  signatureStatus: string;
  missingDocuments: string[];
  propertyAddress: string;
  propertyAttributes: {
    address: string;
    yearBuilt: number;
    squareFootage: number;
    constructionType: string;
    roofType: string;
    roofGeometry: string;
    roofYear: number;
    stories: number;
    primaryUse: string;
    primaryHeating: string;
    plumbingSystem: string;
    electricalPanel: string;
  };
  conversations: Array<{
    role: string;
    content: string;
    timestamp: string;
  }>;
}

export function getDefaultSeedTicket(): SeedTicketContext {
  const now = Date.now();
  const effectiveDate = new Date(now - 351 * 86400000).toISOString().slice(0, 10);
  const renewalDate = new Date(now + 14 * 86400000).toISOString().slice(0, 10);

  return {
    ticketId: 'HQ-DEMO-001',
    policyNumber: 'HQ-POL-88421',
    carrier: 'Citizens',
    status: 'active',
    customerName: 'Jordan Mitchell',
    customerPhone: process.env.TWILIO_DEFAULT_PHONE || process.env.DEFAULT_CUSTOMER_PHONE || '+919503760623',
    recipientEmail: process.env.DEMO_CUSTOMER_EMAIL || 'hemantj@wekancode.com',
    userId: '6ad9bd5dcfc164fb5ece28e1',
    billedToMortgage: true,
    effectiveDate,
    renewalDate,
    daysUntilExpiry: 14,
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
    signatureRequired: false,
    esignSent: true,
    signatureStatus: 'PENDING_CUSTOMER_SIGNATURE',
    missingDocuments: ['application', 'supplemental_signature_page'],
    propertyAddress: '1244 Ocean Drive, Miami Beach, FL 33139',
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
    conversations: [
      {
        role: 'system',
        content: 'Customer Jordan Mitchell initiated self-service verification.',
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
