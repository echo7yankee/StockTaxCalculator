import { describe, it, expect } from 'vitest';
import { BROKERS, CSV_BROKERS, getBrokerMeta } from '../brokers';

describe('broker registry', () => {
  it('marks Trading 212 as trusted', () => {
    expect(BROKERS.trading212.status).toBe('trusted');
    expect(BROKERS.trading212.label).toBe('Trading 212');
  });

  it('marks Interactive Brokers as beta', () => {
    expect(BROKERS.ibkr.status).toBe('beta');
    expect(BROKERS.ibkr.label).toBe('Interactive Brokers');
  });

  it('lists trusted brokers before beta in CSV_BROKERS', () => {
    expect(CSV_BROKERS.map((b) => b.id)).toEqual(['trading212', 'ibkr']);
  });

  it('resolves known broker ids', () => {
    expect(getBrokerMeta('ibkr')?.status).toBe('beta');
    expect(getBrokerMeta('trading212')?.status).toBe('trusted');
  });

  it('returns null for unknown, empty, or missing broker ids', () => {
    expect(getBrokerMeta('revolut')).toBeNull();
    expect(getBrokerMeta('')).toBeNull();
    expect(getBrokerMeta(undefined)).toBeNull();
    expect(getBrokerMeta(null)).toBeNull();
  });
});
