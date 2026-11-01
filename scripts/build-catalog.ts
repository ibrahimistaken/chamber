import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  countListRules,
  type CatalogEntry,
  type CatalogIndex,
} from '../src/core/catalog.ts';
import { compileRules, RuleValidationError } from '../src/core/matcher.ts';
import { validateListObject } from '../src/core/validate-list.ts';

export class CatalogBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogBuildError';
  }
}

export interface RawCatalogFileInput {
  readonly filePath: string;
  readonly content: string;
}

const CURRENT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
const DEFAULT_REPO_ROOT = resolve(CURRENT_DIR, '..');
const DEFAULT_SCHEMA_PATH = resolve(DEFAULT_REPO_ROOT, 'schema/list.schema.json');

function getAjvValidator(schemaPath: string = DEFAULT_SCHEMA_PATH) {
  const rawSchema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as Record<string, unknown>;
  const ajv = new Ajv2020({ allErrors: true });
  return ajv.compile(rawSchema);
}

/**
 * Validates raw list file contents against `schema/list.schema.json` (Ajv),
 * `validateListObject`, and `compileRules`, rejects duplicate `id`s, and
 * returns the generated `CatalogIndex`.
 */
export function buildCatalogFromFiles(
  files: readonly RawCatalogFileInput[],
  schemaPath: string = DEFAULT_SCHEMA_PATH,
): CatalogIndex {
  const ajvValidate = getAjvValidator(schemaPath);
  const seenIds = new Map<string, string>();
  const entries: CatalogEntry[] = [];

  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.content);
    } catch (err) {
      throw new CatalogBuildError(
        `Invalid JSON in "${file.filePath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const ajvOk = ajvValidate(parsed);
    if (!ajvOk) {
      const details = (ajvValidate.errors ?? [])
        .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim())
        .join('; ');
      throw new CatalogBuildError(`Schema validation failed in "${file.filePath}": ${details}`);
    }

    const runtimeValidation = validateListObject(parsed);
    if (!runtimeValidation.ok) {
      throw new CatalogBuildError(
        `Validation failed in "${file.filePath}": ${runtimeValidation.error}`,
      );
    }

    const { list } = runtimeValidation;

    const expectedFileName = `${list.id}.json`;
    const actualFileName = basename(file.filePath.replace(/\\/g, '/'));
    if (actualFileName !== expectedFileName) {
      throw new CatalogBuildError(
        `File name "${actualFileName}" in "${file.filePath}" does not match list id "${list.id}" (expected "${expectedFileName}").`,
      );
    }

    try {
      compileRules([list.rules]);
    } catch (err) {
      if (err instanceof RuleValidationError) {
        throw new CatalogBuildError(
          `Rule compilation failed in "${file.filePath}": ${err.message}`,
        );
      }
      throw err;
    }

    const previousFile = seenIds.get(list.id);
    if (previousFile !== undefined) {
      throw new CatalogBuildError(
        `Duplicate list id "${list.id}" found in "${file.filePath}" and "${previousFile}".`,
      );
    }
    seenIds.set(list.id, file.filePath);

    entries.push({
      id: list.id,
      name: list.name,
      description: list.description ?? '',
      author: list.author,
      version: list.version,
      ...(list.tags !== undefined ? { tags: list.tags } : {}),
      ruleCount: countListRules(list.rules),
      path: `lists/${list.id}.json`,
    });
  }

  return {
    version: 1,
    lists: entries,
  };
}

export interface BuildCatalogDirectoryOptions {
  readonly listsDir?: string;
  readonly repoRoot?: string;
  readonly schemaPath?: string;
  readonly outputPath?: string;
}

/**
 * Reads all `.json` files in `lists/`, validates them, and optionally writes `index.json`.
 */
export function buildCatalogFromDirectory(
  options?: BuildCatalogDirectoryOptions,
): CatalogIndex {
  const repoRoot = options?.repoRoot ?? DEFAULT_REPO_ROOT;
  const listsDir = options?.listsDir ?? join(repoRoot, 'lists');
  const schemaPath = options?.schemaPath ?? DEFAULT_SCHEMA_PATH;

  const filenames = readdirSync(listsDir)
    .filter((name) => name.endsWith('.json') && basename(name) !== 'index.json')
    .sort((a, b) => a.localeCompare(b));

  const files: RawCatalogFileInput[] = filenames.map((filename) => {
    const absPath = join(listsDir, filename);
    const relPath = relative(repoRoot, absPath).replace(/\\/g, '/');
    return {
      filePath: relPath,
      content: readFileSync(absPath, 'utf-8'),
    };
  });

  const catalog = buildCatalogFromFiles(files, schemaPath);

  if (options?.outputPath !== undefined) {
    writeFileSync(options.outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf-8');
  }

  return catalog;
}

const isExecutedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
  const outArgIndex = process.argv.indexOf('--out');
  const customOut =
    outArgIndex !== -1 && process.argv[outArgIndex + 1]
      ? resolve(process.cwd(), process.argv[outArgIndex + 1]!)
      : resolve(DEFAULT_REPO_ROOT, 'index.json');

  const catalog = buildCatalogFromDirectory({ outputPath: customOut });
  console.log(`Built catalog with ${catalog.lists.length} lists -> ${customOut}`);
}

