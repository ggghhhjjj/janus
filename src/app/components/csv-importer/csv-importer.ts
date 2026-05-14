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
export class CsvImporterComponent {
  readonly step = signal<ImportStep>('upload');
  readonly fileName = signal('');
  readonly fileError = signal('');
  readonly detectedFormat = signal<CsvFormat>('unknown');
  readonly previewRows = signal<string[][]>([]);
  readonly previewHeaders = signal<string[]>([]);
  readonly parsedTransactions = signal<NewTransaction[]>([]);
  readonly toImport = signal<NewTransaction[]>([]);
  readonly duplicates = signal<NewTransaction[]>([]);
  readonly summary = signal<ImportSummary | null>(null);
  readonly importing = signal(false);

  readonly hasConflicts = computed(() => this.duplicates().length > 0);
  readonly forceImport = signal(false);

  private rawRows: string[][] = [];

  constructor(
    private readonly csvParser: CsvParserService,
    private readonly state: StateService,
    private readonly router: Router,
    readonly i18n: I18nService
  ) {}

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.processFile(file);
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.processFile(file);
  }

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

  confirmFormat(): void {
    const parsed = this.csvParser.normalize(this.rawRows, this.detectedFormat());
    this.parsedTransactions.set(parsed);
    this.step.set('transactions');
  }

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

  goToTransactions(): void {
    this.router.navigate(['/transactions']);
  }

  formatLabel(format: CsvFormat): string {
    if (format === 'ibkr') return 'Interactive Brokers (IBKR)';
    if (format === 'degiro') return 'DEGIRO';
    return 'Generic CSV';
  }
}
