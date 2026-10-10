export interface HistoricalDate {
  snaktype?: "somevalue" | "novalue";
  value: string;
  sourceValue?: string;
  statementId?: string;
  rank?: string;
  precision: number;
  calendar?: string;
  before?: number;
  after?: number;
  approximate?: boolean;
  qualifiers?: Record<string, unknown>;
  references?: unknown[];
}
export interface Portrait {
  path?: string;
  thumbnailUrl?: string;
  source: string;
  artist: string;
  license: string;
  licenseUrl: string;
  credit?: string;
}
export interface Person {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  occupations: string[];
  birth: HistoricalDate[];
  death: HistoricalDate[];
  sources: string[];
  portrait?: Portrait;
  regions?: string[];
  gender?: string;
  livingAsOf?: string;
}
export interface Snapshot {
  generatedAt: string;
  people: Person[];
  [key: string]: unknown;
}
