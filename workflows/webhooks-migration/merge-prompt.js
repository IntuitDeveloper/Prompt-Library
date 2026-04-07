const fs = require('fs');
const path = require('path');
const os = require('os');

// Usage: node merge-prompt.js [language]
// Language selects values from language maps in prompt-config.json
// Default: uses the "language" key in the config file
const langOverride = process.argv[2] || null;
const configPath = path.join(__dirname, 'prompt-config.json');
const templatePath = path.join(__dirname, 'prompt-template.md');
const outputPath = path.join(__dirname, 'ready-prompt.md');

// Validate files exist
if (!fs.existsSync(configPath)) {
  console.error(`Config file not found: ${configPath}`);
  process.exit(1);
}

if (!fs.existsSync(templatePath)) {
  console.error(`Template file not found: ${templatePath}`);
  process.exit(1);
}

// Load config and template
const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const language = langOverride || rawConfig.language;

if (!language) {
  const available = Object.keys(
    Object.values(rawConfig).find(v => typeof v === 'object' && v !== null) || {}
  );
  console.error('No language specified. Set "language" in prompt-config.json or pass as argument:');
  console.error(`  node merge-prompt.js [${available.join(' | ')}]`);
  process.exit(1);
}

// Resolve language maps: if a value is an object, pick the language key
// If a value is a string, use as-is (shared across all languages)
const config = {};
const missingLang = [];

for (const [key, value] of Object.entries(rawConfig)) {
  if (key === 'language') continue; // skip the selector itself
  if (typeof value === 'string') {
    config[key] = value;
  } else if (typeof value === 'object' && value !== null) {
    if (value[language] !== undefined) {
      config[key] = value[language];
    } else {
      missingLang.push(key);
    }
  }
}

if (missingLang.length > 0) {
  console.error(`\n❌ Language "${language}" not found in these config keys:`);
  missingLang.forEach(k => console.error(`   - ${k}`));
  console.error(`\n   Add a "${language}" entry to each, or pick a supported language.`);
  process.exit(1);
}

let prompt = fs.readFileSync(templatePath, 'utf8');

// Track which variables were resolved
const resolved = [];

// Multi-pass replacement to handle nested {{variables}} in config values
const MAX_PASSES = 3;
for (let pass = 0; pass < MAX_PASSES; pass++) {
  let madeReplacement = false;

  for (const [key, value] of Object.entries(config)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    const matches = prompt.match(regex);
    if (matches) {
      prompt = prompt.replace(regex, value);
      madeReplacement = true;

      if (pass === 0) {
        resolved.push({ key, count: matches.length });
      } else {
        const existing = resolved.find(r => r.key === key);
        if (existing) {
          existing.count += matches.length;
        } else {
          resolved.push({ key, count: matches.length, nested: true });
        }
      }
    }
  }

  if (!madeReplacement) break;
}

// Find all remaining {{variables}} and classify
const allRemaining = prompt.match(/\{\{[a-zA-Z_]+\}\}/g);
const unresolved = [];
const runtimePlaceholders = [];

if (allRemaining) {
  const unique = [...new Set(allRemaining)];
  const configKeys = new Set(Object.keys(config));

  unique.forEach(v => {
    const varName = v.replace(/\{\{|\}\}/g, '');
    if (configKeys.has(varName)) {
      unresolved.push(v);
    } else {
      runtimePlaceholders.push(v);
    }
  });
}

// Write output
fs.writeFileSync(outputPath, prompt, 'utf8');

// Also copy to Desktop for easy access (include domain name to avoid conflicts)
const domainName = path.basename(__dirname);
const desktopCopy = path.join(os.homedir(), 'Desktop', `ready-prompt-${domainName}.md`);
fs.writeFileSync(desktopCopy, prompt, 'utf8');

// Report
console.log(`\n✅ Generated: ${outputPath}`);
console.log(`   Desktop:   ${desktopCopy}`);
console.log(`   Language:  ${language}`);
console.log(`   Resolved:  ${resolved.length} variables (${resolved.reduce((sum, r) => sum + r.count, 0)} replacements)`);

if (unresolved.length > 0) {
  console.log(`\n⚠️  UNRESOLVED CONFIG VARIABLES (${unresolved.length}):`);
  unresolved.forEach(v => console.log(`   - ${v}`));
  console.log('\n   These exist in your config but were not resolved. Check for typos.');
} else {
  console.log('   Unresolved: 0 — all config variables resolved.');
}

if (runtimePlaceholders.length > 0) {
  console.log(`\n📌 Runtime placeholders (${runtimePlaceholders.length}) — expected, filled at runtime:`);
  runtimePlaceholders.forEach(v => console.log(`   - ${v}`));
}

console.log('');
