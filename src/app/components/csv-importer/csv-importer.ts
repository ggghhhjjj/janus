import {
  ChangeDetectionStrategy,
  Component,
  signal,
  computed,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { CsvParserService, CsvFormat } from '../../services/csv-parser.service';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';
import { NewTransaction } from '../../models/transaction.model';
import { DecimalPipe } from '@angular/common';

type ImportStep = 'upload' | 'preview' | 'transactions' | 'conflicts' | 'result';

interface ImportSummary {
  imported: number;
  skipped: number;
  errors: number;
}

@Component({
  selector: 'app-csv-importer',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './csv-importer.html',
  styleUrl: './csv-importer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * CsvImporterComponent
 *
 * Business purpose:
 * - Provide a guided CSV import UI for transaction data (Interactive Brokers,
 *   DEGIRO, or generic CSV).
 * - Detect CSV format, parse raw rows, present a preview, identify duplicates
 *   against existing transactions, and persist new transactions via
 *   `StateService`.
 *
 * Responsibilities:
 * - Manage the import flow state (`step`) and temporary parsed data as signals
 *   consumed by the template.
 * - Delegate CSV parsing and normalization to `CsvParserService` and
 *   persistence to `StateService` to keep parsing and storage concerns out of
 *   the component.
 */
export class CsvImporterComponent {
  /** Current import step for the UI flow. */
  readonly step = signal<ImportStep>('upload');

  /** Name of the selected file. */
  readonly fileName = signal('');

  /** User-facing file error message shown in the UI. */
  readonly fileError = signal('');

  /** Detected CSV format (ibkr | degiro | generic | unknown). */
  readonly detectedFormat = signal<CsvFormat>('unknown');

  /** A small preview of rows shown to the user (first few data rows). */
  readonly previewRows = signal<string[][]>([]);

  /** Parsed header row from the CSV file. */
  readonly previewHeaders = signal<string[]>([]);

  /** Transactions parsed and normalized from CSV (awaiting user confirmation). */
  readonly parsedTransactions = signal<NewTransaction[]>([]);

  /** Transactions selected to be imported after duplicate checks. */
  readonly toImport = signal<NewTransaction[]>([]);

  /** Duplicate transactions detected compared with existing state. */
  readonly duplicates = signal<NewTransaction[]>([]);

  /** Summary counts produced after an import operation completes. */
  readonly summary = signal<ImportSummary | null>(null);

  /** Whether an import operation is in progress. */
  readonly importing = signal(false);

  /** True when duplicates exist (used by the template to route UI). */
  readonly hasConflicts = computed(() => this.duplicates().length > 0);

  /** Force import flag; if set, duplicates can be imported.
   * Exposed as a signal for template control. */
  readonly forceImport = signal(false);

  /** Raw parsed CSV rows retained while progressing through the flow. @private */
  private rawRows: string[][] = [];

  /**
   * @param csvParser Service responsible for parsing and detecting CSV formats
   * @param state Global state service used to persist transactions and access existing ones
   * @param router Router used for navigation after import
   * @param i18n Runtime i18n helper exposed to templates
   */
  constructor(
    private readonly csvParser: CsvParserService,
    private readonly state: StateService,
    private readonly router: Router,
    readonly i18n: I18nService
  ) {}

  /** Drag-over handler: allow drop target by preventing default behavior. */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  /** Drop handler: accept file drops and initiate processing. */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.processFile(file);
  }

  /** File input change handler: process the selected file. */
  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.processFile(file);
  }

  /**
   * Validate and read a CSV file, then forward contents to the preview step.
   * Sets `fileError` with user-friendly messages for invalid files.
   * @private
   */
  private processFile(file: File): void {
    this.fileError.set('');

    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.fileError.set('Please select a CSV file (.csv).');
      return;
    }

    if (file.size === 0) {
      this.fileError.set('File is empty. Please select a valid CSV.');
      return;
    }

    this.fileName.set(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      this.parseAndPreview(text);
    };
    reader.onerror = () => {
      this.fileError.set('Could not read file. Please try again.');
    };
    reader.readAsText(file, 'utf-8');
  }

  /**
   * Parse CSV text into rows, detect format and prepare a short preview.
   * Advances the step to `preview` when successful and sets `fileError` on failure.
   * @private
   */
  private parseAndPreview(csvText: string): void {
    let rows: string[][];
    try {
      rows = this.csvParser.parseRaw(csvText);
    } catch {
      this.fileError.set('Could not parse file. Please check the format.');
      return;
    }

    if (rows.length < 2) {
      this.fileError.set('File is empty or contains only headers. Please check the file.');
      return;
    }

    const headers = rows[0];
    const format = this.csvParser.detectFormat(headers);

    if (format === 'unknown') {
      this.fileError.set(
        'Format not recognized. Please use Interactive Brokers, DEGIRO, or generic CSV format.'
      );
      return;
    }

    this.rawRows = rows;
    this.detectedFormat.set(format);
    this.previewHeaders.set(headers);
    this.previewRows.set(rows.slice(1, 6)); // first 5 data rows
    this.step.set('preview');
  }

  /**
   * Confirm the detected CSV format, normalize rows into transactions and
   * advance to the transactions review step.
   */
  confirmFormat(): void {
    const parsed = this.csvParser.normalize(this.rawRows, this.detectedFormat());
    this.parsedTransactions.set(parsed);
    this.step.set('transactions');
  }

  /**
   * Check for duplicate transactions versus existing state and populate
   * `toImport` and `duplicates`, then advance to the `conflicts` step.
   */
  checkConflicts(): void {
    const existing = this.state.transactions;
    const { toImport, duplicates } = this.csvParser.findDuplicates(
      this.parsedTransactions(),
      existing
    );
    this.toImport.set(toImport);
    this.duplicates.set(duplicates);
    this.step.set('conflicts');
  }

  /**
   * Persist transactions to application state. `skipDuplicates` controls whether
   * duplicates are excluded from the import. Updates `summary` with counts.
   */
  async doImport(skipDuplicates: boolean): Promise<void> {
    this.importing.set(true);
    const txsToImport = skipDuplicates ? this.toImport() : [...this.toImport(), ...this.duplicates()];

    let imported = 0;
    let errors = 0;

    try {
      await this.state.addTransactions(txsToImport);
      imported = txsToImport.length;
    } catch {
      errors = 1;
    }

    this.summary.set({
      imported,
      skipped: skipDuplicates ? this.duplicates().length : 0,
      errors,
    });
    this.importing.set(false);
    this.step.set('result');
  }

  /** Reset the importer back to its initial state, clearing temporary data. */
  reset(): void {
    this.step.set('upload');
    this.fileName.set('');
    this.fileError.set('');
    this.detectedFormat.set('unknown');
    this.previewRows.set([]);
    this.previewHeaders.set([]);
    this.parsedTransactions.set([]);
    this.toImport.set([]);
    this.duplicates.set([]);
    this.summary.set(null);
    this.rawRows = [];
  }

  /** Navigate to the transactions page after import or on user action. */
  goToTransactions(): void {
    this.router.navigate(['/transactions']);
  }

  /** Human-readable label for CSV format enum values. */
  formatLabel(format: CsvFormat): string {
    if (format === 'ibkr') return 'Interactive Brokers (IBKR)';
    if (format === 'degiro') return 'DEGIRO';
    return 'Generic CSV';
  }
}
