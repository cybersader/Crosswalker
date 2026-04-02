import { parseCSV, analyzeColumns } from '../src/import/parsers/csv-parser';

describe('parseCSV', () => {
  it('parses simple CSV content', async () => {
    const csv = 'Name,ID,Description\nAlice,1,Test\nBob,2,Another';
    const result = await parseCSV(csv);

    expect(result.columns).toEqual(['Name', 'ID', 'Description']);
    expect(result.rows).toHaveLength(2);
    expect(result.rowCount).toBe(2);
    expect(result.rows[0]['Name']).toBe('Alice');
    expect(result.rows[1]['ID']).toBe('2');
  });

  it('trims header whitespace', async () => {
    const csv = '  Name  , ID ,Description\nAlice,1,Test';
    const result = await parseCSV(csv);

    expect(result.columns).toEqual(['Name', 'ID', 'Description']);
  });

  it('handles empty content', async () => {
    const csv = '';
    const result = await parseCSV(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.rowCount).toBe(0);
  });

  it('handles headers only (no data rows)', async () => {
    const csv = 'Col1,Col2,Col3\n';
    const result = await parseCSV(csv);

    expect(result.columns).toEqual(['Col1', 'Col2', 'Col3']);
    expect(result.rows).toHaveLength(0);
  });

  it('handles quoted fields with commas', async () => {
    const csv = 'Name,Description\nAlice,"Has a, comma"\nBob,Simple';
    const result = await parseCSV(csv);

    expect(result.rows[0]['Description']).toBe('Has a, comma');
  });

  it('skips empty rows by default', async () => {
    const csv = 'Name,ID\nAlice,1\n\nBob,2\n\n';
    const result = await parseCSV(csv);

    expect(result.rowCount).toBe(2);
  });
});

describe('analyzeColumns', () => {
  it('detects column types from data', () => {
    const data = {
      columns: ['ID', 'Name', 'URL', 'Count'],
      rows: [
        { ID: 'AC-1', Name: 'Access Control', URL: 'https://example.com', Count: '42' },
        { ID: 'AC-2', Name: 'Account Mgmt', URL: 'https://test.com', Count: '7' },
      ],
      rowCount: 2,
    };

    const analysis = analyzeColumns(data);

    expect(analysis).toHaveLength(4);
    expect(analysis[0].name).toBe('ID');
    expect(analysis[3].name).toBe('Count');
  });

  it('provides sample values', () => {
    const data = {
      columns: ['Name'],
      rows: [
        { Name: 'Alice' },
        { Name: 'Bob' },
        { Name: 'Charlie' },
      ],
      rowCount: 3,
    };

    const analysis = analyzeColumns(data);

    expect(analysis[0].sampleValues.length).toBeGreaterThan(0);
    expect(analysis[0].sampleValues).toContain('Alice');
  });
});
