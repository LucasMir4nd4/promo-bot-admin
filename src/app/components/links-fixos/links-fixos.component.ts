import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { BotApiService, LinkFixo, LinkPreview } from '../../services/bot-api.service';

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

  // ─── Cadastro por link (preview antes de gravar) ────────────────────────────

  /** O que o backend entendeu do link colado. Null = nada para confirmar ainda. */
  preview: LinkPreview | null = null;

  /** Uma análise em voo. Trava o botão e evita pedir duas vezes o mesmo texto. */
  analisando = false;

  /** Link de afiliado opcional: preenchido aqui, o item já nasce ativo. */
  linkAfiliadoNovo = '';

  /** Adia a análise enquanto o usuário ainda está digitando/colando. */
  private timerPreview: any = null;

  /** Última entrada analisada, para não repetir a chamada à toa. */
  private ultimaEntradaAnalisada: string | null = null;

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

  // ─── Busca e cadastro por link ─────────────────────────────────────────────

  /**
   * Normalizador só para FILTRAR a lista local. Quem decide o que é um ID válido
   * de verdade é o backend, no preview — aqui basta casar texto.
   */
  private idAproximado(texto: string): string | null {
    const m = texto.trim().toUpperCase().match(/MLB-?(\d{6,})/);
    return m ? `MLB${m[1]}` : null;
  }

  /** Lista exibida: tudo quando a busca está vazia, senão o que casa por id ou título. */
  get linksFiltrados(): LinkFixo[] {
    const termo = this.busca.trim().toLowerCase();
    if (!termo) return this.links;

    const id = this.idAproximado(this.busca)?.toLowerCase();
    return this.links.filter(l =>
      (l.mlbId ?? '').toLowerCase().includes(id ?? termo) ||
      (l.titulo ?? '').toLowerCase().includes(termo)
    );
  }

  get buscando(): boolean {
    return this.busca.trim().length > 0;
  }

  /** O texto colado parece um link/ID do ML? Só então vale consultar o backend. */
  get pareceLinkMl(): boolean {
    const t = this.busca.trim();
    return /MLB/i.test(t) || /^\d{8,}$/.test(t) || /mercadolivre\.com/i.test(t);
  }

  /**
   * Dispara a análise ao digitar, com um respiro de 500ms.
   *
   * Sem o debounce, colar uma URL de 120 caracteres geraria uma chamada por
   * tecla — e o preview resolve catálogo no ML, então cada chamada custa caro.
   */
  aoDigitar(): void {
    this.erroAdicionar = null;
    if (this.timerPreview) clearTimeout(this.timerPreview);

    const texto = this.busca.trim();
    if (!texto || !this.pareceLinkMl) {
      this.preview = null;
      this.ultimaEntradaAnalisada = null;
      return;
    }
    if (texto === this.ultimaEntradaAnalisada) return;

    this.timerPreview = setTimeout(() => this.analisar(), 500);
  }

  /** POST /api/links/preview — descobre o que é o link antes de gravar qualquer coisa. */
  analisar(): void {
    const entrada = this.busca.trim();
    if (!entrada || this.analisando) return;

    this.analisando = true;
    this.erroAdicionar = null;
    this.ultimaEntradaAnalisada = entrada;

    this.api.preverLink(entrada).subscribe({
      next: (preview) => {
        this.analisando = false;
        this.preview = preview;
      },
      error: (e) => {
        this.analisando = false;
        this.preview = null;
        this.erroAdicionar = this.mensagemErroRede(e?.status);
      }
    });
  }

  /** Grava o item que está no card de preview. */
  confirmarCadastro(): void {
    if (!this.preview?.utilizavel || this.adicionando) return;

    this.adicionando = true;
    this.erroAdicionar = null;

    this.api.adicionarLink(this.preview.entrada, this.linkAfiliadoNovo).subscribe({
      next: (novo) => {
        this.adicionando = false;
        if (novo?.id != null) this.links = [novo, ...this.links];
        this.cancelarPreview();
        this.busca = '';
        this.carregar();
      },
      error: (e) => {
        this.adicionando = false;
        // O backend manda 'erro' e 'comoResolver'; mostrar os dois é o que
        // transforma "deu 400" em algo que o usuário consegue resolver sozinho.
        const corpo = e?.error;
        this.erroAdicionar = corpo?.erro
          ? [corpo.erro, corpo.comoResolver].filter(Boolean).join(' ')
          : this.mensagemErroRede(e?.status);
      }
    });
  }

  cancelarPreview(): void {
    this.preview = null;
    this.linkAfiliadoNovo = '';
    this.ultimaEntradaAnalisada = null;
  }

  limparBusca(): void {
    this.busca = '';
    this.erroAdicionar = null;
    this.cancelarPreview();
  }

  /** Rótulo humano para o tipo de ID que o backend detectou. */
  get rotuloTipo(): string {
    switch (this.preview?.tipoDetectado) {
      case 'ITEM': return 'Anúncio';
      case 'CATALOG_PRODUCT': return 'Ficha de catálogo';
      case 'USER_PRODUCT': return 'Agrupador do vendedor';
      default: return 'Não reconhecido';
    }
  }

  private mensagemErroRede(status: number | undefined): string {
    switch (status) {
      case 0:
        return 'Sem resposta do bot. Verifique se ele está online e a URL configurada.';
      case 404:
      case 405:
        return 'Esta versão do backend não tem o cadastro por link (POST /api/links/preview).';
      default:
        return `Falha ao falar com o bot (erro ${status ?? 'desconhecido'}).`;
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
   * Exclusão em lote: uma única chamada ao endpoint DELETE /api/links.
   *
   * Antes isto disparava N DELETEs em paralelo — 50 itens viravam 50 requisições
   * e um estado parcial quando algumas falhavam. O backend já resolve tudo numa
   * transação e ainda diz quais IDs já não existiam.
   */
  private apagarEmLote(ids: number[]): void {
    if (this.acaoLote) return;

    this.acaoLote = 'deletar';
    this.mensagemLote = null;
    this.loteComErro = false;
    ids.forEach(id => this.pendingIds.add(id));

    this.api.deletarLinks(ids).subscribe({
      next: (res) => {
        // 'naoEncontrados' são itens que outra aba já apagou: sumiram da tela
        // do mesmo jeito, então entram na limpeza junto com os removidos.
        const foram = new Set([...(res.ids ?? []), ...(res.naoEncontrados ?? [])]);
        this.links = this.links.filter(l => l.id == null || !foram.has(l.id));

        ids.forEach(id => this.pendingIds.delete(id));
        foram.forEach(id => this.selecionados.delete(id));
        this.acaoLote = null;
        this.loteComErro = false;
        this.mensagemLote = res.mensagem ?? `${res.removidos} link(s) removido(s).`;
        setTimeout(() => { this.mensagemLote = null; }, 5000);
      },
      error: () => {
        ids.forEach(id => this.pendingIds.delete(id));
        this.acaoLote = null;
        this.avisarLote('Falha ao remover os selecionados. Nada foi apagado.');
      }
    });
  }

  /**
   * Apaga a tabela inteira. Pede confirmação dupla porque leva junto os links de
   * afiliado preenchidos na mão — o trabalho manual que não dá para recuperar.
   */
  limparTudo(): void {
    if (this.acaoLote || this.links.length === 0) return;
    if (!confirm(`Remover TODOS os ${this.links.length} links, incluindo os links de afiliado já preenchidos? Isso não tem volta.`)) return;

    this.acaoLote = 'deletar';
    this.api.deletarTodosLinks(true).subscribe({
      next: (res) => {
        this.links = [];
        this.limparSelecao();
        this.acaoLote = null;
        this.loteComErro = false;
        this.mensagemLote = res.mensagem ?? `${res.removidos} link(s) removido(s).`;
        setTimeout(() => { this.mensagemLote = null; }, 5000);
      },
      error: () => {
        this.acaoLote = null;
        this.avisarLote('Falha ao limpar a lista.');
      }
    });
  }

  /**
   * Ativar/desativar continuam item a item — o backend não tem endpoint de lote
   * para eles, e cada falha é isolada para que os que deram certo já apareçam.
   */
  private aplicarLote(ids: number[], acao: AcaoLote): void {
    if (acao === 'deletar') { this.apagarEmLote(ids); return; }
    if (this.acaoLote) return;

    this.acaoLote = acao;
    this.mensagemLote = null;
    this.loteComErro = false;
    ids.forEach(id => this.pendingIds.add(id));

    const chamar = (id: number): Observable<any> => {
      if (acao === 'ativar') return this.api.ativarLink(id);
      return this.api.desativarLink(id);
    };

    forkJoin(
      ids.map(id => chamar(id).pipe(
        map(resposta => ({ id, ok: true, resposta })),
        catchError(() => of({ id, ok: false, resposta: null as any }))
      ))
    ).subscribe(resultados => {
      const sucessos = resultados.filter(r => r.ok);
      const falhas = resultados.length - sucessos.length;

      for (const r of sucessos) {
        const idx = this.links.findIndex(l => l.id === r.id);
        if (idx !== -1 && r.resposta) this.links[idx] = r.resposta as LinkFixo;
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
