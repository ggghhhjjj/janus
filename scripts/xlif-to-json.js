#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const LOCALES = ['en', 'bg'];
const XLIFF_DIR = path.join(__dirname, '../src/locale');
const OUTPUT_DIR = path.join(__dirname, '../src/app/services');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'translations.generated.ts');

const parser = new xml2js.Parser();

async function parseXlifFile(locale) {
  const filename = locale === 'en' ? 'messages.xlf' : `messages.${locale}.xlf`;
  const filepath = path.join(XLIFF_DIR, filename);

  if (!fs.existsSync(filepath)) {
    console.warn(`Warning: File not found: ${filepath}`);
    return {};
  }

  try {
    const xml = fs.readFileSync(filepath, 'utf8');
    const data = await parser.parseStringPromise(xml);

    const translations = {};
    const fileBody = data.xliff.file[0].body[0];
    const transUnits = fileBody['trans-unit'];

    if (transUnits) {
      transUnits.forEach((unit) => {
        const id = unit['$'].id;
        
        // For source language (en), extract from <source>
        // For target language, use <target> if available, otherwise fall back to <source>
        let textContent;
        const sourceElement = unit.source;
        
        if (locale === 'en') {
          textContent = extractTextFromElement(sourceElement);
        } else {
          if (unit.target) {
            textContent = extractTextFromElement(unit.target);
          } else {
            textContent = extractTextFromElement(sourceElement);
          }
        }

        if (textContent) {
          translations[id] = textContent;
        }
      });
    }

    return translations;
  } catch (error) {
    console.error(`Error parsing ${filename}:`, error.message);
    return {};
  }
}

function extractTextFromElement(element) {
  if (!element || !element[0]) return '';

  const content = element[0];
  
  // If it's plain text, return it
  if (typeof content === 'string') {
    return content.trim();
  }

  // If it's an object with text and/or XML nodes
  if (typeof content === 'object') {
    // Try to get text content
    if (content._ && typeof content._ === 'string') {
      return content._.trim();
    }
    
    // If it has <x> child elements (interpolations), try to extract text around them
    // For now, just return empty if it's pure interpolation
    if (content.x) {
      // This is likely an interpolation node, return empty to use fallback
      return '';
    }
  }

  return '';
}

async function generateTypeScriptFile() {
  console.log('Extracting translations from XLIF files...');

  const allTranslations = {};

  for (const locale of LOCALES) {
    allTranslations[locale] = await parseXlifFile(locale);
  }

  // Generate TypeScript file
  const tsContent = `// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated from XLIF files in src/locale/
// Run: npm run i18n:bundle

export interface TranslationMap {
  [key: string]: {
    [locale: string]: string;
  };
}

export const GENERATED_TRANSLATIONS: TranslationMap = ${JSON.stringify(
    convertToTranslationMap(allTranslations),
    null,
    2
  )};
`;

  fs.writeFileSync(OUTPUT_FILE, tsContent, 'utf8');
  console.log(`✓ Generated ${OUTPUT_FILE}`);
  console.log('Translation bundles generated successfully.');
}

function convertToTranslationMap(localeTranslations) {
  const translationMap = {};

  // Get all unique keys from all locales
  const allKeys = new Set();
  Object.values(localeTranslations).forEach((translations) => {
    Object.keys(translations).forEach((key) => allKeys.add(key));
  });

  // Build the translation map with all locales for each key
  allKeys.forEach((key) => {
    translationMap[key] = {};
    LOCALES.forEach((locale) => {
      translationMap[key][locale] = localeTranslations[locale][key] || localeTranslations['en'][key] || key;
    });
  });

  return translationMap;
}

generateTypeScriptFile().catch((error) => {
  console.error('Error generating translation bundles:', error);
  process.exit(1);
});

