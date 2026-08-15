import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { BotApiService, LinkFixo } from '../../services/bot-api.service';

type EstadoExec = 'idle' | 'loading' | 'success' | 'error';
type Visao = 'grade' | 'tabela';
type AcaoLote = 'ativar' | 'desativar' | 'deletar';

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

  /** Quadros (estilo hub de afiliados) ou tabela — a escolha fica salva entre visitas. */
  visao: Visao = (localStorage.getItem('links_visao') as Visao) || 'grade';

  /** Tamanho das fotos na tabela — a escolha fica salva entre visitas. */
  fotoGrande = localStorage.getItem('links_foto_grande') === 'true';

  /** Item com a foto aberta no lightbox. */
  fotoAmpliada: LinkFixo | null = null;

  /** Id do link cujo "copiar" acabou de ser clicado (feedback do ✓). */
  linkCopiado: number | null = null;

  /** Modo "selecionar": mostra as caixas de seleção e a barra de ações em lote. */
  modoSelecao = false;

  /** Ids marcados no modo seleção. */
  selecionados = new Set<number>();

  /** Ação em lote rodando agora (trava a barra enquanto as chamadas não voltam). */
  acaoLote: AcaoLote | null = null;

  mensagemLote: string | null = null;
  loteComErro = false;

  /** Texto da caixa de busca: filtra a lista e serve de entrada pro cadastro manual. */
  busca = '';

  adicionando = false;
  erroAdicionar: string | null = null;

  constructor(private api: BotApiService) {}

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.loading = true;
    this.erro = false;
    this.api.listarLinks().subscribe({
      next: (data) => {
        this.links = data;
        this.loading = false;
        this.podarSelecao();
      },
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

  // ─── Busca e cadastro manual ───────────────────────────────────────────────

  /** Extrai/normaliza o MLB ID de um texto livre (id solto, com hífen ou URL colada). */
  private extrairMlbId(texto: string): string | null {
    const t = texto.trim().toUpperCase();

    const comPrefixo = t.match(/MLB-?(\d{6,})/);
    if (comPrefixo) return `MLB${comPrefixo[1]}`;

    const soDigitos = t.match(/^(\d{8,})$/);
    return soDigitos ? `MLB${soDigitos[1]}` : null;
  }

  /** Lista exibida: tudo quando a busca está vazia, senão o que casa por id ou título. */
  get linksFiltrados(): LinkFixo[] {
    const termo = this.busca.trim().toLowerCase();
    if (!termo) return this.links;

    const id = this.extrairMlbId(this.busca)?.toLowerCase();
    return this.links.filter(l =>
      (l.mlbId ?? '').toLowerCase().includes(id ?? termo) ||
      (l.titulo ?? '').toLowerCase().includes(termo)
    );
  }

  get buscando(): boolean {
    return this.busca.trim().length > 0;
  }

  /** MLB ID válido digitado que ainda não existe na lista — é o que libera o "+ Adicionar". */
  get mlbIdParaAdicionar(): string | null {
    const id = this.extrairMlbId(this.busca);
    if (!id) return null;
    const existe = this.links.some(l => (l.mlbId ?? '').toUpperCase() === id);
    return existe ? null : id;
  }

  limparBusca(): void {
    this.busca = '';
    this.erroAdicionar = null;
  }

  adicionarPorId(): void {
    const id = this.mlbIdParaAdicionar;
    if (!id || this.adicionando) return;

    this.adicionando = true;
    this.erroAdicionar = null;

    this.api.adicionarLink(id).subscribe({
      next: (novo) => {
        // O snapshot (título, preço, foto) fica por conta do bot — daí o recarregamento.
        if (novo?.id != null) this.links = [novo, ...this.links];
        this.adicionando = false;
        this.busca = '';
        this.carregar();
      },
      error: (e) => {
        this.adicionando = false;
        this.erroAdicionar = this.mensagemErroAdicionar(e?.status, id);
      }
    });
  }

  private mensagemErroAdicionar(status: number | undefined, id: string): string {
    switch (status) {
      case 409:
        return `${id} já está cadastrado.`;
      case 400:
        // O backend pode exigir o link de afiliado junto na criação.
        return `O bot recusou ${id}. Confira se o ID existe no Mercado Livre.`;
      case 404:
      case 405:
        return `O bot não aceita cadastro manual: POST /api/links não está disponível nesta versão do backend.`;
      case 0:
        return `Sem resposta do bot. Verifique se ele está online e a URL configurada.`;
      default:
        return `Não foi possível adicionar ${id} (erro ${status ?? 'desconhecido'}).`;
    }
  }

  // ─── Seleção múltipla ──────────────────────────────────────────────────────

  alternarModoSelecao(): void {
    this.modoSelecao = !this.modoSelecao;
    if (!this.modoSelecao) this.limparSelecao();
    this.mensagemLote = null;
  }

  alternarSelecao(link: LinkFixo): void {
    if (link.id == null || this.acaoLote) return;
    if (this.selecionados.has(link.id)) this.selecionados.delete(link.id);
    else this.selecionados.add(link.id);
  }

  isSelecionado(link: LinkFixo): boolean {
    return link.id != null && this.selecionados.has(link.id);
  }

  /**
   * Marca todos os itens visíveis — ou desmarca, se já estiverem todos marcados.
   * Com busca ativa só mexe no que está na tela; o que ficou fora do filtro
   * continua marcado (desmarcar tudo, aí sim, limpa a seleção inteira).
   */
  alternarTodos(): void {
    if (this.acaoLote) return;
    if (this.todosSelecionados) { this.limparSelecao(); return; }

    const visiveis = this.idsVisiveis();
    this.selecionados = new Set([...this.selecionados, ...visiveis]);
  }

  limparSelecao(): void {
    this.selecionados = new Set<number>();
  }

  /** Descarta ids que sumiram da lista depois de um recarregamento. */
  private podarSelecao(): void {
    const existentes = new Set(this.links.map(l => l.id).filter((id): id is number => id != null));
    this.selecionados = new Set([...this.selecionados].filter(id => existentes.has(id)));
  }

  private idsVisiveis(): number[] {
    return this.linksFiltrados.map(l => l.id).filter((id): id is number => id != null);
  }

  get totalSelecionados(): number {
    return this.selecionados.size;
  }

  /** "Todos" leva em conta só o que está visível no filtro atual. */
  get todosSelecionados(): boolean {
    const visiveis = this.idsVisiveis();
    return visiveis.length > 0 && visiveis.every(id => this.selecionados.has(id));
  }

  ativarSelecionados(): void {
    // Pendente não pode ser ativado (sem link de afiliado o backend recusa) e
    // quem já está ativo não precisa de chamada.
    const ids = this.linksSelecionados()
      .filter(l => !this.isPendente(l) && !l.ativo)
      .map(l => l.id!);

    if (!ids.length) {
      this.avisarLote('Nenhum dos selecionados pode ser ativado (pendentes precisam do link de afiliado).');
      return;
    }
    this.aplicarLote(ids, 'ativar');
  }

  desativarSelecionados(): void {
    const ids = this.linksSelecionados()
      .filter(l => !this.isPendente(l) && l.ativo)
      .map(l => l.id!);

    if (!ids.length) {
      this.avisarLote('Nenhum dos selecionados está ativo.');
      return;
    }
    this.aplicarLote(ids, 'desativar');
  }

  deletarSelecionados(): void {
    const ids = this.linksSelecionados().map(l => l.id!);
    if (!ids.length) return;

    const confirmacao = ids.length === 1
      ? 'Remover o link selecionado?'
      : `Remover os ${ids.length} links selecionados?`;
    if (!confirm(confirmacao)) return;

    this.aplicarLote(ids, 'deletar');
  }

  private linksSelecionados(): LinkFixo[] {
    return this.links.filter(l => l.id != null && this.selecionados.has(l.id));
  }

  /**
   * O backend só expõe endpoints por item, então o lote é um disparo em paralelo:
   * cada falha é isolada para que os itens que deram certo já sejam aplicados na tela.
   */
  private aplicarLote(ids: number[], acao: AcaoLote): void {
    if (this.acaoLote) return;

    this.acaoLote = acao;
    this.mensagemLote = null;
    this.loteComErro = false;
    ids.forEach(id => this.pendingIds.add(id));

    const chamar = (id: number): Observable<any> => {
      if (acao === 'ativar') return this.api.ativarLink(id);
      if (acao === 'desativar') return this.api.desativarLink(id);
      return this.api.deletarLink(id);
    };

    forkJoin(
      ids.map(id => chamar(id).pipe(
        map(resposta => ({ id, ok: true, resposta })),
        catchError(() => of({ id, ok: false, resposta: null as any }))
      ))
    ).subscribe(resultados => {
      const sucessos = resultados.filter(r => r.ok);
      const falhas = resultados.length - sucessos.length;

      if (acao === 'deletar') {
        const removidos = new Set(sucessos.map(r => r.id));
        this.links = this.links.filter(l => l.id == null || !removidos.has(l.id));
      } else {
        for (const r of sucessos) {
          const idx = this.links.findIndex(l => l.id === r.id);
          if (idx !== -1 && r.resposta) this.links[idx] = r.resposta as LinkFixo;
        }
      }

      ids.forEach(id => this.pendingIds.delete(id));
      sucessos.forEach(r => this.selecionados.delete(r.id));
      this.acaoLote = null;
      this.loteComErro = falhas > 0;
      this.mensagemLote = this.resumoLote(acao, sucessos.length, falhas);
      setTimeout(() => { this.mensagemLote = null; this.loteComErro = false; }, 5000);
    });
  }

  private resumoLote(acao: AcaoLote, ok: number, falhas: number): string {
    const verbo = acao === 'ativar' ? 'ativado' : acao === 'desativar' ? 'desativado' : 'removido';
    const plural = ok === 1 ? '' : 's';
    const base = `${ok} link${plural} ${verbo}${plural}.`;
    return falhas > 0 ? `${base} ${falhas} falhou/falharam.` : base;
  }

  private avisarLote(mensagem: string): void {
    this.loteComErro = true;
    this.mensagemLote = mensagem;
    setTimeout(() => { this.mensagemLote = null; this.loteComErro = false; }, 5000);
  }

  setVisao(visao: Visao): void {
    this.visao = visao;
    localStorage.setItem('links_visao', visao);
  }

  copiarLink(link: LinkFixo): void {
    if (!link.linkAfiliado || link.id == null) return;
    navigator.clipboard?.writeText(link.linkAfiliado).then(() => {
      this.linkCopiado = link.id!;
      setTimeout(() => { if (this.linkCopiado === link.id) this.linkCopiado = null; }, 2000);
    });
  }

  toggleTamanhoFoto(): void {
    this.fotoGrande = !this.fotoGrande;
    localStorage.setItem('links_foto_grande', String(this.fotoGrande));
  }

  abrirFoto(link: LinkFixo): void {
    if (link.urlImagem) this.fotoAmpliada = link;
  }

  fecharFoto(): void {
    this.fotoAmpliada = null;
  }

  @HostListener('document:keydown.escape')
  aoApertarEsc(): void {
    this.fecharFoto();
  }

  isPending(link: LinkFixo): boolean {
    return link.id != null && this.pendingIds.has(link.id);
  }

  trackById(_: number, item: LinkFixo): any {
    return item.id;
  }
}
