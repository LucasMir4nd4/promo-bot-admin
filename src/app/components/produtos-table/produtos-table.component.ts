import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BotApiService, ProdutoEnviado } from '../../services/bot-api.service';

@Component({
  selector: 'app-produtos-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './produtos-table.component.html',
  styleUrls: ['./produtos-table.component.css']
})
export class ProdutosTableComponent implements OnInit {

  produtos: ProdutoEnviado[] = [];
  loading = true;
  erro = false;
  horas = 24;

  readonly horasOpcoes = [6, 12, 24, 48, 72];

  constructor(private api: BotApiService) {}

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.loading = true;
    this.erro = false;

    this.api.getEnviados(this.horas).subscribe({
      next: (data) => {
        this.produtos = data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.erro = true;
      }
    });
  }

  mudarHoras(h: number): void {
    this.horas = h;
    this.carregar();
  }

  formatPreco(valor?: number): string {
    if (valor == null) return '—';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatData(data: string): string {
    if (!data) return '—';
    return new Date(data).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  getCanalIcon(canal?: string): string {
    if (!canal) return '📢';
    const c = canal.toLowerCase();
    if (c.includes('telegram')) return '✈️';
    if (c.includes('whatsapp')) return '💬';
    return '📢';
  }

  getDescontoClass(percentualDesconto?: number): string {
    if (!percentualDesconto) return '';
    if (percentualDesconto >= 50) return 'desconto-alto';
    if (percentualDesconto >= 25) return 'desconto-medio';
    return 'desconto-baixo';
  }

  // Índice para trackBy performance
  trackById(index: number, item: ProdutoEnviado): any {
    return item.id ?? index;
  }
}
