import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BotApiService } from '../../services/bot-api.service';

@Component({
  selector: 'app-config-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './config-modal.component.html',
  styleUrls: ['./config-modal.component.css']
})
export class ConfigModalComponent {

  @Output() fechar = new EventEmitter<void>();

  urlInput = '';
  salvo = false;

  constructor(private api: BotApiService) {
    this.urlInput = this.api.baseUrl();
  }

  salvar(): void {
    if (!this.urlInput.trim()) return;
    this.api.setBaseUrl(this.urlInput.trim());
    this.salvo = true;
    setTimeout(() => {
      this.salvo = false;
      this.fechar.emit();
    }, 1200);
  }

  cancelar(): void {
    this.fechar.emit();
  }

  // Fecha ao clicar no backdrop
  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.fechar.emit();
    }
  }
}
