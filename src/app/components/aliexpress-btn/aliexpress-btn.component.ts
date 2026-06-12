import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BotApiService } from '../../services/bot-api.service';

type EstadoBtn = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-aliexpress-btn',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './aliexpress-btn.component.html',
  styleUrls: ['./aliexpress-btn.component.css']
})
export class AliexpressBtnComponent {

  estado: EstadoBtn = 'idle';
  mensagem: string | null = null;
  produtosEnviados: number | null = null;
  logs: string[] = [];

  constructor(private api: BotApiService) {}

  executar(): void {
    if (this.estado === 'loading') return;

    this.estado = 'loading';
    this.mensagem = null;
    this.produtosEnviados = null;
    this.addLog('Iniciando ciclo AliExpress...');

    this.api.executarAliexpress().subscribe({
      next: (res) => {
        this.estado = 'success';
        this.mensagem = res.message || 'Ciclo AliExpress executado com sucesso!';
        this.produtosEnviados = res.produtosEnviados ?? null;
        this.addLog(`✓ ${this.mensagem}`);
        if (this.produtosEnviados !== null) {
          this.addLog(`✓ ${this.produtosEnviados} produto(s) enviado(s)`);
        }
        setTimeout(() => this.estado = 'idle', 5000);
      },
      error: (err) => {
        this.estado = 'error';
        this.mensagem = err?.error?.message || 'Falha ao executar AliExpress. Verifique se o bot está online.';
        this.addLog(`✗ Erro: ${this.mensagem}`);
        setTimeout(() => this.estado = 'idle', 5000);
      }
    });
  }

  private addLog(msg: string): void {
    const ts = new Date().toLocaleTimeString('pt-BR');
    this.logs.unshift(`[${ts}] ${msg}`);
    if (this.logs.length > 8) this.logs = this.logs.slice(0, 8);
  }

  limparLogs(): void {
    this.logs = [];
  }
}
