/**
 * lib/domain-handlers.ts
 *
 * Domain-Aware Context Layers.
 *
 * Maps file extensions to domain-specific AI instructions.
 * The returned string is appended to the base system prompt in ai-client.ts,
 * ensuring the model focuses on the conventions that matter for each file type.
 */

export interface DomainHandler {
  extensions: string[];
  label: string;
  context: string;
}

export interface DomainContext {
  label: string;
  context: string;
}

const DOMAIN_REGISTRY: DomainHandler[] = [
  {
    extensions: ['.ts', '.tsx', '.d.ts'],
    label: 'TypeScript',
    context: `Domain: TypeScript / TSX
Focus areas for this delta:
- Interface, type alias, or enum changes (added/removed/renamed fields).
- Exported function or class signature changes.
- Import/export statement additions or removals.
- Generic type parameter changes.
- Strict-null or optional-property additions (?).
If the diff only touches types/interfaces, prefer the "refactor" type.
If it adds a new exported symbol, prefer "feat".`,
  },
  {
    extensions: ['.vue'],
    label: 'Vue SFC',
    context: `Domain: Vue Single-File Component
Focus areas for this delta:
- <script setup> composable usage or new reactive state.
- <template> structural changes (v-if, v-for, emit, props).
- <style> scoped rule additions or removals.
- New props or emits defined in defineProps / defineEmits.
- Component imports added or removed.
If only the template changes, use "style" or "refactor".
If a new prop or emit is added, use "feat".`,
  },
  {
    extensions: ['.py'],
    label: 'Python',
    context: `Domain: Python
Focus areas for this delta:
- New function or class definitions added.
- PEP 8 / type hint changes.
- Import additions or removals (stdlib, third-party).
- requirements.txt / pyproject.toml dependency changes → use "build" type.
- Docstring additions are "docs".
- Logic changes inside existing functions are "fix" or "refactor".`,
  },
  {
    extensions: ['.js', '.mjs', '.cjs'],
    label: 'JavaScript',
    context: `Domain: JavaScript / ESM
Focus areas for this delta:
- New exported function or class.
- Import/require additions or removals.
- Async/await or Promise chain changes.
- Error handling additions (try/catch).`,
  },
  {
    extensions: ['.css', '.scss', '.sass', '.less'],
    label: 'Stylesheet',
    context: `Domain: CSS / Preprocessor
Focus areas for this delta:
- New CSS custom properties (--var).
- Selector additions or removals.
- Media query changes.
- Animation/keyframe additions.
All stylesheet-only changes should use the "style" commit type.`,
  },
  {
    extensions: ['.json', '.jsonc'],
    label: 'JSON Config',
    context: `Domain: JSON / Config
If this is package.json: describe which dependencies were added, removed, or updated.
If this is tsconfig / .eslintrc / vite.config: describe the configuration key that changed.
Use "chore" or "build" type.`,
  },
  {
    extensions: ['.md', '.mdx'],
    label: 'Markdown / Docs',
    context: `Domain: Documentation
Describe what section or topic was added, updated, or removed.
Always use the "docs" commit type.`,
  },
  {
    extensions: ['.yaml', '.yml'],
    label: 'YAML / CI',
    context: `Domain: YAML / CI Pipeline
If this is a GitHub Actions / CI config, describe which job, step, or trigger changed.
Use "ci" type for pipeline changes, "chore" for everything else.`,
  },
  {
    extensions: ['.sh', '.bash'],
    label: 'Shell Script',
    context: `Domain: Shell Script
Focus on what command or conditional block was added or changed.
Use "chore" or "build" type.`,
  },
];

/**
 * Resolves the domain for a given file path.
 *
 * @param filePath - Relative or absolute path to the file.
 * @returns DomainContext containing the label and system prompt injection.
 */
export function resolveDomain(filePath: string): DomainContext {
  const ext = getExtension(filePath);
  const handler = DOMAIN_REGISTRY.find((h) => h.extensions.includes(ext));
  
  if (handler) {
    return { label: handler.label, context: handler.context };
  }
  
  // Fallback: no domain-specific context
  return {
    label: 'Generic',
    context: 'No specific domain rules apply. Analyze the delta as-is.',
  };
}

/**
 * Extracts the lowercase extension from a file path.
 * Handles double extensions like ".d.ts".
 *
 * @param filePath - Path to extract extension from.
 * @returns e.g. ".ts" | ".vue" | ".py"
 */
function getExtension(filePath: string): string {
  if (filePath.endsWith('.d.ts')) return '.d.ts';
  const idx = filePath.lastIndexOf('.');
  if (idx === -1) return '';
  return filePath.slice(idx).toLowerCase();
}
