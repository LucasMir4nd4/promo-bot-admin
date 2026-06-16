import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BotApiService, LinkFixo } from '../../services/bot-api.service';

type EstadoExec = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-links-fixos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './links-fixos.component.html',
  styleUrls: ['./links-fixos.component.css']
})
export class LinksFixosComponent implements OnInit {

  links: LinkFixo[] = [];
  loading = true;
  erro = false;

  estadoExec: EstadoExec = 'idle';
  mensagemExec: string | null = null;

  pendingIds = new Set<number>();

  // Rascunho do link de afiliado por item pendente (chave = id do link)
  rascunhoAfiliado: Record<number, string> = {};

  constructor(private api: BotApiService) {}

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.loading = true;
    this.erro = false;
    this.api.listarLinks().subscribe({
      next: (data) => { this.links = data; this.loading = false; },
      error: () => { this.erro = true; this.loading = false; }
    });
  }

  /** Item pendente = capturado pelo bot, ainda sem link de afiliado preenchido. */
  isPendente(link: LinkFixo): boolean {
    return !link.linkAfiliado || link.linkAfiliado.trim().length === 0;
  }

  /** Preenche o link de afiliado de um pendente (o backend já o ativa). */
  definirAfiliado(link: LinkFixo): void {
    if (link.id == null || this.pendingIds.has(link.id)) return;
    const valor = (this.rascunhoAfiliado[link.id] ?? '').trim();
    if (!valor) return;

    this.pendingIds.add(link.id);
    this.api.definirAfiliado(link.id, valor).subscribe({
      next: (atualizado) => {
        const idx = this.links.findIndex(l => l.id === atualizado.id);
        if (idx !== -1) this.links[idx] = atualizado;
        delete this.rascunhoAfiliado[link.id!];
        this.pendingIds.delete(link.id!);
      },
      error: () => this.pendingIds.delete(link.id!)
    });
  }

  toggleAtivo(link: LinkFixo): void {
    if (link.id == null || this.pendingIds.has(link.id)) return;
    // Sem link de afiliado não dá pra ativar (o backend recusaria).
    if (!link.ativo && this.isPendente(link)) return;
    this.pendingIds.add(link.id);

    const op = link.ativo
      ? this.api.desativarLink(link.id)
      : this.api.ativarLink(link.id);

    op.subscribe({
      next: (atualizado) => {
        const idx = this.links.findIndex(l => l.id === atualizado.id);
        if (idx !== -1) this.links[idx] = atualizado;
        this.pendingIds.delete(link.id!);
      },
      error: () => this.pendingIds.delete(link.id!)
    });
  }

  deletar(link: LinkFixo): void {
    if (link.id == null || this.pendingIds.has(link.id)) return;
    this.pendingIds.add(link.id);

    this.api.deletarLink(link.id).subscribe({
      next: () => {
        this.links = this.links.filter(l => l.id !== link.id);
        this.pendingIds.delete(link.id!);
      },
      error: () => this.pendingIds.delete(link.id!)
    });
  }

  executarLinksFixos(): void {
    if (this.estadoExec === 'loading') return;
    this.estadoExec = 'loading';
    this.mensagemExec = null;

    this.api.executarLinksFixos().subscribe({
      next: (res) => {
        this.estadoExec = 'success';
        this.mensagemExec = res.mensagem || res.message || 'Links fixos executados!';
        setTimeout(() => { this.estadoExec = 'idle'; this.mensagemExec = null; }, 5000);
      },
      error: () => {
        this.estadoExec = 'error';
        this.mensagemExec = 'Falha ao executar links fixos.';
        setTimeout(() => { this.estadoExec = 'idle'; this.mensagemExec = null; }, 5000);
      }
    });
  }

  isPending(link: LinkFixo): boolean {
    return link.id != null && this.pendingIds.has(link.id);
  }

  trackById(_: number, item: LinkFixo): any {
    return item.id;
  }
}
