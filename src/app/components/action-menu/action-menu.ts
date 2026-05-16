import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

export interface ActionMenuItem {
  label: string;
  ariaLabel: string;
  danger?: boolean;
  action: () => void;
}

@Component({
  selector: 'app-action-menu',
  standalone: true,
  imports: [],
  templateUrl: './action-menu.html',
  styleUrl: './action-menu.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionMenuComponent {
  readonly items = input<ActionMenuItem[]>([]);
  readonly triggerAriaLabel = input<string>('');

  readonly isOpen = signal(false);
  private readonly menuPosition = signal<{ top: string; left: string } | null>(null);

  private readonly el = inject(ElementRef);

  @ViewChild('trigger') private triggerBtn!: ElementRef<HTMLButtonElement>;

  readonly positionStyle = computed(() => {
    const pos = this.menuPosition();
    if (!pos) return '';
    return `position: fixed; top: ${pos.top}; left: ${pos.left};`;
  });

  onTriggerClick(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.isOpen.set(true);
      setTimeout(() => {
        this.calculatePosition();
        const firstItem = (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>('.action-menu__item');
        firstItem?.focus();
      }, 0);
    }
  }

  close(returnFocus = false): void {
    this.isOpen.set(false);
    this.menuPosition.set(null);
    if (returnFocus) {
      this.triggerBtn?.nativeElement.focus();
    }
  }

  onMenuKeydown(event: KeyboardEvent, index: number): void {
    const items = (this.el.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.action-menu__item');
    const count = items.length;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % count]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + count) % count]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
    } else if (event.key === 'Tab') {
      this.close();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.el.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) {
      this.close(true);
    }
  }

  private calculatePosition(): void {
    const btn = this.triggerBtn?.nativeElement;
    if (!btn) return;

    const buttonRect = btn.getBoundingClientRect();
    const itemCount = this.items().length;
    const menuWidth = 120;
    const menuHeight = itemCount * 38 + 16;
    const margin = 4;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Vertical: prefer below button, fall back to above
    let top =
      viewportHeight - buttonRect.bottom >= menuHeight + margin
        ? buttonRect.bottom + margin
        : buttonRect.top - menuHeight - margin;

    // Horizontal: prefer right-of-button (left-align with button), fall back to left-of-button
    let left =
      viewportWidth - buttonRect.left >= menuWidth + margin
        ? buttonRect.left
        : buttonRect.right - menuWidth;

    // Clamp all 4 edges within viewport
    top  = Math.max(margin, Math.min(top,  viewportHeight - menuHeight - margin));
    left = Math.max(margin, Math.min(left, viewportWidth  - menuWidth  - margin));

    this.menuPosition.set({ top: `${top}px`, left: `${left}px` });
  }
}
