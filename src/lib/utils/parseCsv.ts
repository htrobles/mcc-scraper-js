import { promises as fs } from 'fs'; // 'fs/promises' not available in node 12
import { parse } from 'csv-parse/sync';

export default async function parseCsv(pathName: string): Promise<string[]> {
  const content = await fs.readFile(pathName);

  // Parse the CSV content
  const records = parse(content, { bom: true });

  return records;
}
