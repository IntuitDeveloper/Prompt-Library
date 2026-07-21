const fs = require('fs');
const path = require('path');

// --- CLI argument parsing ---
const args = process.argv.slice(2);
let configFile = 'prompt-config.json';
const configFlagIndex = args.indexOf('--config');
if (configFlagIndex !== -1 && args[configFlagIndex + 1]) {
  configFile = args[configFlagIndex + 1];
}

// --language <lang> selects which SDK notes file (if any) to inject into the
// {{sdk_notes}} placeholder. Falls back to language_framework from the config.
let language = null;
const languageFlagIndex = args.indexOf('--language');
if (languageFlagIndex !== -1 && args[languageFlagIndex + 1]) {
  language = args[languageFlagIndex + 1];
}

// Normalize a language name to its sdk-notes filename stem (e.g. "C#" -> "dotnet").
function normalizeLanguage(lang) {
  if (!lang) return null;
  // Map "c#" -> "csharp" before stripping symbols so it doesn't collapse to "c".
  const key = String(lang).toLowerCase().replace(/#/g, 'sharp').replace(/[^a-z0-9]/g, '');
  const aliases = {
    py: 'python', python: 'python', python3: 'python',
    ts: 'nodejs', typescript: 'nodejs', js: 'nodejs', javascript: 'nodejs', node: 'nodejs', nodejs: 'nodejs',
    dotnet: 'dotnet', net: 'dotnet', csharp: 'dotnet', cs: 'dotnet',
    java: 'java',
    php: 'php',
    ruby: 'ruby', rb: 'ruby',
  };
  return aliases[key] || key;
}

// Display name + default typing system for a normalized language. Used to keep
// the whole prompt consistent when --language overrides the config default.
function languageProfile(normalized) {
  const profiles = {
    python: { framework: 'Python3', typing: 'hints (dataclasses)' },
    java:   { framework: 'Java', typing: 'Java classes/records' },
    dotnet: { framework: '.NET (C#)', typing: 'C# classes/records' },
    nodejs: { framework: 'TypeScript', typing: 'TypeScript interfaces' },
    php:    { framework: 'PHP', typing: 'PHP 8 typed properties' },
    ruby:   { framework: 'Ruby', typing: 'Sorbet type annotations' },
  };
  return profiles[normalized] || null;
}
if (!fs.existsSync(configFile)) {
  console.error(`Error: Config file "${configFile}" not found.`);
  process.exit(1);
}
console.log(`Using config: ${configFile}`);

// --- Load and validate config against schema ---
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const schemaPath = path.join(__dirname, 'prompt-config.schema.json');
if (fs.existsSync(schemaPath)) {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const errors = validateConfig(config, schema);
  if (errors.length > 0) {
    console.error('Config validation errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
  console.log('Config validation passed.');
} else {
  console.warn('Warning: prompt-config.schema.json not found, skipping validation.');
}

// Resolve the SDK notes for a template. Notes live in a `sdk-notes/` folder next
// to the template (e.g. custom-fields/sdk-notes/python.md). Returns the notes
// text, or an empty string when no notes apply (so {{sdk_notes}} never leaks).
function resolveSdkNotes(templateFile) {
  // Language precedence: --language flag, then language_framework from config.
  const lang = normalizeLanguage(language || config.language_framework);
  if (!lang) return '';

  const notesDir = path.join(__dirname, path.dirname(templateFile), 'sdk-notes');
  if (!fs.existsSync(notesDir)) {
    return ''; // This prompt has no SDK notes at all — templates handle this.
  }

  const notesFile = path.join(notesDir, `${lang}.md`);
  if (!fs.existsSync(notesFile)) {
    const available = fs.readdirSync(notesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''));
    console.warn(
      `\nWarning: no SDK notes for language "${lang}" in ${notesDir}.` +
      `\n  Available: ${available.join(', ') || '(none)'}. Leaving SDK notes section empty.`
    );
    return '';
  }

  console.log(`Injecting SDK notes: ${path.relative(__dirname, notesFile)}`);
  return fs.readFileSync(notesFile, 'utf8').trim();
}

// --- Merge helper (multi-pass to resolve nested placeholders) ---
function mergeTemplate(templateFile, outputFile) {
  let prompt = fs.readFileSync(templateFile, 'utf8');

  // sdk_notes is not a config key — it's loaded from a per-prompt notes file.
  // Merge it alongside the config values so {{sdk_notes}} always resolves.
  const mergeValues = { ...config, sdk_notes: resolveSdkNotes(templateFile) };

  // When --language is explicitly passed, override the language fields too, so the
  // prompt's Context line and typing match the injected SDK notes (otherwise the
  // prompt contradicts itself). With no flag, config values are used unchanged.
  if (language) {
    const profile = languageProfile(normalizeLanguage(language));
    if (profile) {
      mergeValues.language_framework = profile.framework;
      mergeValues.typing_system = profile.typing;
      console.log(`Language override: language_framework="${profile.framework}", typing_system="${profile.typing}"`);
    }
  }

  const MAX_PASSES = 5;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const [key, value] of Object.entries(mergeValues)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      const before = prompt;
      prompt = prompt.replace(pattern, String(value));
      if (prompt !== before) changed = true;
    }
    if (!changed) break;
  }
  fs.writeFileSync(outputFile, prompt, 'utf8');
  console.log(`Generated ${outputFile}`);

  // Post-merge: classify any remaining {{placeholders}}.
  // - "unresolved" = name matches a config key but wasn't replaced (typo or merge bug)
  // - "runtime" = name is not in config; expected, filled in at runtime by the AI
  const remaining = [...new Set(prompt.match(/\{\{[a-zA-Z0-9_-]+\}\}/g) || [])];
  const configKeys = new Set(Object.keys(mergeValues));
  const unresolved = remaining.filter(p => configKeys.has(p.slice(2, -2)));
  const runtime = remaining.filter(p => !configKeys.has(p.slice(2, -2)));
  if (unresolved.length > 0) {
    console.warn(`\nWarning: ${unresolved.length} unresolved config placeholder(s) in ${outputFile}:`);
    unresolved.forEach(p => console.warn(`  - ${p}`));
    console.warn('These exist in your config but were not replaced. Check for typos.');
  }
  if (runtime.length > 0) {
    console.log(`Runtime placeholders (${runtime.length}) — expected, filled at runtime:`);
    runtime.forEach(p => console.log(`  - ${p}`));
  }
}

// --- Interactive prompt for selecting which prompt to generate ---
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\nSelect prompt to generate:');
console.log('  1 - Build prompt for dimensions API');
console.log('  2 - Build prompt for project estimates');
console.log('  3 - Build prompt for custom fields');
console.log('  4 - Build prompt for sales tax');
console.log('  5 - Build prompt for project budgets');
console.log('  6 - Build prompt for project change orders');
console.log('  7 - Build prompt for OAuth 2.0 setup');

rl.question('\nEnter your choice (1-7): ', (answer) => {
  const choice = answer.trim();

  if (choice === '1') {
    //generate prompt for dimensions API use cases code generation
    mergeTemplate('dimensions/prompt-template-dimensions.md', 'generated-prompts/dimensions-ready-prompt.md');
  } else if (choice === '2') {
    //generate prompt for project Estimates use cases code generation
    mergeTemplate('projects/prompt-template-projects.md', 'generated-prompts/projects-ready-prompt.md');
  } else if (choice === '3') {
    //generate prompt for custom fields use cases code generation
    mergeTemplate('custom-fields/prompt-template-custom-fields.md', 'generated-prompts/custom-fields-ready-prompt.md');
  } else if (choice === '4') {
    //generate prompt for sales tax use cases code generation
    mergeTemplate('sales-tax/prompt-template-sales-tax.md', 'generated-prompts/sales-tax-ready-prompt.md');
  } else if (choice === '5') {
    //generate prompt for project budgets use cases code generation
    mergeTemplate('project-budgets/prompt-template-project-budgets.md', 'generated-prompts/project-budgets-ready-prompt.md');
  } else if (choice === '6') {
    //generate prompt for project change orders use cases code generation
    mergeTemplate('project-change-orders/prompt-template-project-change-orders.md', 'generated-prompts/project-change-orders-ready-prompt.md');
  } else if (choice === '7') {
    //generate prompt for OAuth 2.0 setup use cases code generation
    mergeTemplate('oauth-setup/prompt-template-oauth-setup.md', 'generated-prompts/oauth-setup-ready-prompt.md');
  } else {
    console.error('Invalid choice. Please enter 1-7.');
    rl.close();
    process.exit(1);
  }

  rl.close();
});

// --- Lightweight JSON Schema validator (no external dependencies) ---
function validateConfig(config, schema) {
  const errors = [];
  if (schema.required) {
    for (const key of schema.required) {
      if (!(key in config)) {
        errors.push(`Missing required field: "${key}"`);
      }
    }
  }
  if (schema.properties) {
    for (const [key, rule] of Object.entries(schema.properties)) {
      if (!(key in config)) continue;
      const val = config[key];
      if (rule.type && typeof val !== rule.type) {
        errors.push(`"${key}" must be type "${rule.type}", got "${typeof val}"`);
      }
      if (rule.enum && !rule.enum.includes(val)) {
        errors.push(`"${key}" must be one of [${rule.enum.join(', ')}], got "${val}"`);
      }
      if (rule.pattern && typeof val === 'string' && !new RegExp(rule.pattern).test(val)) {
        errors.push(`"${key}" must match pattern ${rule.pattern}, got "${val}"`);
      }
      if (rule.minLength && typeof val === 'string' && val.length < rule.minLength) {
        errors.push(`"${key}" must not be empty`);
      }
    }
  }
  return errors;
}