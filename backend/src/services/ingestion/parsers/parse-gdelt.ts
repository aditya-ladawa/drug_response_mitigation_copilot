import * as fs from 'fs';
import * as path from 'path';
import { NewsSignal } from '../../../types';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../artifacts');

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

interface GdeltJson {
  articles?: GdeltArticle[];
}

export function parseGdelt(): NewsSignal[] {
  const filePath = path.join(ARTIFACTS_DIR, 'gdelt_doc_api.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('GDELT artifact not found');
  }

  const data: GdeltJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const articles = data.articles ?? [];

  return articles.map((a) => ({
    title: a.title ?? '',
    url: a.url ?? '',
    seenDate: a.seendate ?? '',
    domain: a.domain ?? '',
    language: a.language ?? '',
    sourcecountry: a.sourcecountry ?? '',
  }));
}
