import { z } from 'zod';
import { CATEGORY_IDS } from './categories';
import type { EngineQueryName, QueryParams } from './ipc';

/** Validação de tudo que chega do renderer (usada apenas no processo principal). */
const nodeId = z.number().int().min(0).max(0xfffffffe);
const idParam = z.object({ id: nodeId });

export const querySchemas: { [K in EngineQueryName]: z.ZodType<QueryParams<K>> } = {
  listVolumes: z.tuple([]),
  summary: z.tuple([]),
  details: z.tuple([idParam]),
  view: z.tuple([
    z.object({
      id: nodeId,
      depth: z.number().int().min(1).max(6),
      maxChildren: z.number().int().min(1).max(500),
      minFraction: z.number().min(0).max(1),
    }),
  ]),
  children: z.tuple([
    z.object({
      id: nodeId,
      sort: z.enum(['size', 'name', 'files', 'mtime']),
      direction: z.enum(['asc', 'desc']),
      filter: z.string().max(260).optional(),
      offset: z.number().int().min(0),
      limit: z.number().int().min(1).max(2000),
    }),
  ]),
  top: z.tuple([
    z.object({
      kind: z.enum(['file', 'dir']),
      category: z.enum(CATEGORY_IDS as [string, ...string[]]).optional(),
      olderThanDays: z.number().int().min(1).max(36500).optional(),
      text: z.string().max(260).optional(),
      limit: z.number().int().min(1).max(1000),
    }),
  ]),
  types: z.tuple([]),
  search: z.tuple([z.object({ text: z.string().max(260), limit: z.number().int().min(1).max(200) })]),
  suggestions: z.tuple([]),
  suggestionItems: z.tuple([z.object({ id: z.string().regex(/^[a-z0-9-]{1,64}$/) })]),
  findPath: z.tuple([z.object({ path: z.string().min(1).max(32_767) })]),
  rankOf: z.tuple([idParam]),
  listScans: z.tuple([]),
} as { [K in EngineQueryName]: z.ZodType<QueryParams<K>> };

export const nodeIdsSchema = z.array(nodeId).min(1).max(50_000);
export const nodeIdSchema = nodeId;
export const scanPathSchema = z.string().trim().min(1).max(32_767);
export const scanIdSchema = z.string().regex(/^[a-z0-9]+-[a-z0-9]+$/);
