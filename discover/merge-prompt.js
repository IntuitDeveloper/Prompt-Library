const fs = require('fs');
const path = require('path');

// --- CLI argument parsing ---
const args = process.argv.slice(2);
let configFile = 'prompt-config.json';
const configFlagIndex = args.indexOf('--config');
if (configFlagIndex !== -1 && args[configFlagIndex + 1]) {
  configFile = args[configFlagIndex + 1];
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

// --- Merge helper (multi-pass to resolve nested placeholders) ---
function mergeTemplate(templateFile, outputFile) {
  let prompt = fs.readFileSync(templateFile, 'utf8');
  const MAX_PASSES = 5;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const [key, value] of Object.entries(config)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      const before = prompt;
      prompt = prompt.replace(pattern, String(value));
      if (prompt !== before) changed = true;
    }
    if (!changed) break;
  }
  // Post-merge: check for unresolved placeholders
  //const unresolved = [...new Set(prompt.match(/\{\{[a-zA-Z0-9_-]+\}\}/g) || [])];
  fs.writeFileSync(outputFile, prompt, 'utf8');
  console.log(`Generated ${outputFile}`);
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

rl.question('\nEnter your choice (1 or 2): ', (answer) => {
  const choice = answer.trim();

  if (choice === '1') {
    //generate prompt for dimensions API use cases code generation
    mergeTemplate('dimensions/prompt-template-dimensions.md', 'generated-prompts/dimensions-ready-prompt.md');
  } else if (choice === '2') {
    //generate prompt for project Estimates use cases code generation
    mergeTemplate('projects/prompt-template-projects.md', 'generated-prompts/projects-ready-prompt.md');
  } else {
    console.error('Invalid choice. Please enter 1 or 2.');
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