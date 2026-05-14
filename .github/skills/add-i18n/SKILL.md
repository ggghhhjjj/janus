---
name: add-i18n
description: "Add or audit i18n support in this project. Use when: adding translations for a new component, auditing templates for hardcoded strings, adding a new language, or updating existing translation keys. Source of truth is translations.generated.ts — no XLIFF files, no build scripts needed."
argument-hint: "Component name or 'audit all' to check coverage"
---

# Add i18n Support

This project uses a **TypeScript-first runtime i18n system**. All translations live in one file. No XLIFF, no code generation, no build steps.

See [I18N.md](../../../I18N.md) for full documentation.

## Source of Truth

**`src/app/services/translations.generated.ts`** — edit this directly to add or update translations.

```typescript
export const GENERATED_TRANSLATIONS: TranslationMap = {
  "myKey": { "en": "English text", "bg": "Български текст" },
};
```

## When to Use

- Auditing a component for hardcoded strings
- Adding translations for a new component
- Adding a new language
- Updating an existing translation

---

## Procedure

### Step 1 — Audit Template for Hardcoded Strings

Read the component's `.html` file. Identify every user-facing string that is **not** already wrapped in `i18n.translate()`:

- Text content: `<h1>Title</h1>`, `<button>Save</button>`, `<p>No items found.</p>`
- Attribute values: `placeholder="e.g. AAPL"`, `aria-label="Close"`, `title="Verified"`
- Conditional strings: `{{ saving ? 'Saving…' : 'Save' }}`
- Dynamic text with embedded values: `Found {{ count }} duplicates`

**Skip:** purely structural text, icons, `<strong>` wrappers around dynamic values.

### Step 2 — Define Translation Keys

Name each key using camelCase with a descriptive prefix:

| Pattern | Examples |
|---------|---------|
| `formLabel*` | `formLabelDate`, `formLabelTicker` |
| `formError*` | `formErrorDate`, `formErrorQuantity` |
| `formPlaceholder*` | `formPlaceholderTime`, `formPlaceholderNotes` |
| `tableHeader*` | `tableHeaderDate`, `tableHeaderTicker` |
| `*Button` | `saveButton`, `cancelButton`, `backButton` |
| `*Title` | `importCsvTitle`, `reorderTitle` |
| `noX` / `emptyX` | `noTransactionsYet`, `noOpenPositions` |

### Step 3 — Add to translations.generated.ts

For each key found, add an entry with **all supported locales** (`en` and `bg`):

```typescript
// src/app/services/translations.generated.ts
"myNewKey": { "en": "English text", "bg": "Български текст" },
```

Always provide both `en` and `bg`. If the Bulgarian translation is not known, translate the English text to Bulgarian directly — this is the skill's responsibility.

### Step 4 — Inject I18nService into Component

Check if the component's `.ts` file already injects I18nService. If not, add it:

```typescript
import { I18nService } from '../../services/i18n.service';

export class MyComponent {
  readonly i18n = inject(I18nService);
  // ...
}
```

If the component already uses a constructor, inject as a constructor parameter:

```typescript
constructor(
  private someService: SomeService,
  readonly i18n: I18nService,
) {}
```

### Step 5 — Update the Template

Replace each hardcoded string with the appropriate pattern:

| Original | Replacement |
|----------|-------------|
| `Save` | `{{ i18n.translate('saveButton') }}` |
| `placeholder="e.g. AAPL"` | `[placeholder]="i18n.translate('formPlaceholderTicker')"` |
| `aria-label="Close"` | `[attr.aria-label]="i18n.translate('closeButton')"` |
| `title="Verified"` | `[attr.title]="i18n.translate('verifiedBadge')"` |
| `{{ saving ? 'Saving…' : 'Save' }}` | `{{ saving ? i18n.translate('saving') : i18n.translate('saveButton') }}` |

For text with embedded dynamic values, split around the dynamic part:
```html
<!-- "Found 3 duplicates" -->
{{ i18n.translate('duplicateFound') }}<strong>{{ count }}</strong>{{ i18n.translate('andMoreLabel') }}
```

### Step 6 — Build and Verify

```bash
npm run build
```

Then test in the browser:
1. Check the component in **Bulgarian** (default) — all strings should be translated
2. Switch to **English** using the language selector in the header
3. Verify all strings render correctly in both languages
4. Check that no raw translation keys appear (missing key shows the key string itself)

---

## Adding a New Language

1. Add the locale code to every entry in `translations.generated.ts`:
   ```typescript
   "saveButton": { "en": "Save", "bg": "Запис", "fr": "Enregistrer" },
   ```

2. Update `I18nService.getSupportedLocales()`:
   ```typescript
   getSupportedLocales(): string[] { return ['en', 'bg', 'fr']; }
   ```

3. Update `I18nService.getLocaleLabel()`:
   ```typescript
   'fr': 'Français',
   ```

4. Rebuild.

---

## Audit Checklist

For each component template, confirm:

- [ ] All `<h1>`–`<h6>` headings use `i18n.translate()`
- [ ] All `<button>` and `<a>` text use `i18n.translate()`
- [ ] All `<label>` text use `i18n.translate()`
- [ ] All static `<p>` and `<span>` text use `i18n.translate()`
- [ ] All `placeholder` attributes use `[placeholder]="i18n.translate()"`
- [ ] All `aria-label` attributes use `[attr.aria-label]="i18n.translate()"`
- [ ] All `title` attributes use `[attr.title]="i18n.translate()"`
- [ ] All validation error messages use `i18n.translate()`
- [ ] All empty-state messages use `i18n.translate()`
- [ ] Conditional text (ternaries) use `i18n.translate()` on both branches

## Quick Diagnostic

To find potential hardcoded strings in a template that are not already translated:

```bash
# Find lines with plain text that are not Angular expressions or i18n calls
grep -v 'i18n\.translate\|{{' src/app/components/MY_COMPONENT/MY_COMPONENT.html | grep -Ev '^\s*[<{]|^\s*$'
```
