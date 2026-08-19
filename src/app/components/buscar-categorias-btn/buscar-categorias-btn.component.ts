import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BotApiService, CategoriaMl } from '../../services/bot-api.service';

type EstadoBtn = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-buscar-categorias-btn',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './buscar-categorias-btn.component.html',
  styleUrls: ['./buscar-categorias-btn.component.css']
})
export class BuscarCategoriasBtnComponent {

  estado: EstadoBtn = 'idle';
  mensagem: string | null = null;
  categorias: CategoriaMl[] = [];
  /** ID copiado por último — usado só para o feedback visual de "copiado". */
  idCopiado: string | null = null;
  logs: string[] = [];

  constructor(private api: BotApiService) {}

  executar(): void {
    if (this.estado === 'loading') return;

    this.estado = 'loading';
    this.mensagem = null;
    this.addLog('Consultando categorias do Mercado Livre...');

    this.api.buscarCategorias().subscribe({
      next: (categorias) => {
        this.estado = 'success';
        this.categorias = categorias;
        this.mensagem = categorias.length
          ? `${categorias.length} categoria(s) retornada(s) pelo Mercado Livre.`
          : 'O Mercado Livre não retornou nenhuma categoria.';
        this.addLog(`✓ ${this.mensagem}`);
        setTimeout(() => this.estado = 'idle', 5000);
      },
      error: (err) => {
        this.estado = 'error';
        this.categorias = [];
        this.mensagem = err?.error?.message || 'Falha ao buscar categorias. Verifique se o bot está online.';
        this.addLog(`✗ Erro: ${this.mensagem}`);
        setTimeout(() => this.estado = 'idle', 5000);
      }
    });
  }

  /** Os IDs (MLB…) são o que vai na config de categorias do bot, então copiar ajuda. */
  copiarId(id: string): void {
    navigator.clipboard?.writeText(id).then(() => {
      this.idCopiado = id;
      setTimeout(() => { if (this.idCopiado === id) this.idCopiado = null; }, 1500);
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
