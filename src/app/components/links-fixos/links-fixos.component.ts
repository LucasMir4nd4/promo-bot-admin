import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BotApiService, LinkFixo, LinkPreview, OfertaNaFila } from '../../services/bot-api.service';

type Visao = 'grade' | 'tabela';
type AcaoLote = 'deletar';

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

  pendingIds = new Set<number>();

  // ─── Fila de ofertas (memória do bot, ainda sem link de afiliado) ───────────

  /** O que a captura por categoria enfileirou e ainda espera link de afiliado. */
  fila: OfertaNaFila[] = [];

  filaCarregando = false;

  /** Fila indisponível (backend antigo ou offline) — some a seção em vez de mentir. */
  filaIndisponivel = false;

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

  /**
   * Link de afiliado do cadastro manual. Obrigatório: o backend ainda aceita
   * gravar sem ele, mas não existe mais endpoint para preencher depois — a
   * linha ficaria inativa para sempre, sem como publicar.
   */
  linkAfiliadoNovo = '';

  /** Adia a análise enquanto o usuário ainda está digitando/colando. */
  private timerPreview: any = null;

  /** Última entrada analisada, para não repetir a chamada à toa. */
  private ultimaEntradaAnalisada: string | null = null;

  // ─── Link compartilhado (o par que vem do modal Compartilhar do ML) ─────────

  /** O painel só aparece quando pedido: o caminho de todo dia é a busca acima. */
  compartilharAberto = false;

  /** Link curto (meli.la/…) copiado do modal Compartilhar. */
  compLinkAfiliado = '';

  /** URL da aba do produto — é dela que o backend tira o MLB. */
  compPaginaProduto = '';

  /** Ligado, a promoção sai na hora; desligado, o item só fica ativo pro ciclo. */
  compPublicar = true;

  compEnviando = false;
  compMensagem: string | null = null;
  compComErro = false;

  constructor(private api: BotApiService) {}

  ngOnInit(): void {
    this.carregar();
    this.carregarFila();
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

  /**
   * GET /api/links/fila.txt — as ofertas capturadas que ainda não viraram link.
   *
   * A fila mora na memória do bot, não no banco: ela não aparece em
   * listarLinks(), e um restart do backend a esvazia. Por isso é uma seção à
   * parte, e não linhas "pendentes" misturadas na lista.
   */
  carregarFila(): void {
    if (this.filaCarregando) return;
    this.filaCarregando = true;

    this.api.listarFila().subscribe({
      next: (ofertas) => {
        this.fila = ofertas;
        this.filaCarregando = false;
        this.filaIndisponivel = false;
      },
      error: () => {
        this.fila = [];
        this.filaCarregando = false;
        this.filaIndisponivel = true;
      }
    });
  }

  /**
   * Manda a oferta da fila para o painel "Compartilhar": é o caminho manual do
   * mesmo fluxo do worker — abrir o anúncio, copiar o link do Compartilhar e
   * colar aqui, com a URL da página já preenchida.
   */
  usarOferta(oferta: OfertaNaFila): void {
    this.compartilharAberto = true;
    this.compPaginaProduto = oferta.urlProduto;
    this.compMensagem = null;
    this.compComErro = false;
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

  /** O cadastro manual só fecha com o link de afiliado junto — ver linkAfiliadoNovo. */
  get podeCadastrar(): boolean {
    return !!this.preview?.utilizavel && this.linkAfiliadoNovo.trim().length > 0;
  }

  /** Grava o item que está no card de preview. */
  confirmarCadastro(): void {
    const preview = this.preview;
    if (!preview || !this.podeCadastrar || this.adicionando) return;

    this.adicionando = true;
    this.erroAdicionar = null;

    this.api.adicionarLink(preview.entrada, this.linkAfiliadoNovo).subscribe({
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

  // ─── Link compartilhado ────────────────────────────────────────────────────

  /**
   * Abre/fecha o painel. Ao abrir, aproveita o que já está na busca como URL do
   * produto — o fluxo real é colar a URL, ver o preview e só então perceber que
   * o que se quer é publicar com o link de afiliado na mão.
   */
  alternarCompartilhar(): void {
    this.compartilharAberto = !this.compartilharAberto;
    this.compMensagem = null;
    this.compComErro = false;

    if (this.compartilharAberto && !this.compPaginaProduto && this.pareceLinkMl) {
      this.compPaginaProduto = this.busca.trim();
    }
  }

  /** Os dois campos são obrigatórios; nenhum dos dois identifica o anúncio sozinho. */
  get compPronto(): boolean {
    return this.compLinkAfiliado.trim().length > 0 && this.compPaginaProduto.trim().length > 0;
  }

  /** POST /api/links/compartilhado — grava o par e (por padrão) publica na hora. */
  registrarCompartilhado(): void {
    if (this.compEnviando) return;
    if (!this.compPronto) {
      this.compComErro = true;
      this.compMensagem = 'Preencha o link de afiliado e a URL da página do produto.';
      return;
    }

    this.compEnviando = true;
    this.compMensagem = null;
    this.compComErro = false;

    this.api.registrarCompartilhado(this.compLinkAfiliado, this.compPaginaProduto, this.compPublicar)
      .subscribe({
        next: (res) => {
          this.compEnviando = false;
          this.compComErro = false;
          this.compMensagem = res.mensagem
            || (res.publicado ? 'Promoção enviada.' : 'Link gravado e item ativado.');

          // Campos limpos para o próximo par; o painel fica aberto porque este
          // fluxo costuma vir em sequência, um anúncio atrás do outro.
          this.compLinkAfiliado = '';
          this.compPaginaProduto = '';
          this.carregar();
          // O anúncio sai da fila assim que o link existe — recarregar mantém a
          // seção de ofertas coerente com o que o backend ainda tem em memória.
          this.carregarFila();
          setTimeout(() => { this.compMensagem = null; }, 8000);
        },
        error: (e) => {
          this.compEnviando = false;
          this.compComErro = true;
          this.compMensagem = this.mensagemErroCompartilhado(e);
        }
      });
  }

  /**
   * O backend responde 400/409 com 'erro', 'motivo' e às vezes 'comoResolver' —
   * mostrar os três é o que separa "deu erro" de "o link era de catálogo".
   */
  private mensagemErroCompartilhado(e: any): string {
    if (e?.status === 404 || e?.status === 405) {
      return 'Esta versão do backend não tem o registro por compartilhamento (POST /api/links/compartilhado).';
    }

    const corpo = e?.error;

    // 422 SEM_DADOS_DO_PRODUTO: o link de afiliado estava certo — quem não
    // entregou foi o Mercado Livre, que devolveu o anúncio sem foto ou sem
    // preço. O bot recusa em vez de gravar um item ativo e impublicável para
    // sempre (o ciclo que um dia o repescaria não existe mais). Vale dizer isso
    // com todas as letras: sem essa frase, "não deu certo" mandaria você tentar
    // de novo, e repetir não muda nada — o que falta está do lado do ML.
    if (e?.status === 422) {
      return [
        corpo?.erro ?? 'O Mercado Livre não devolveu os dados deste anúncio.',
        'Gerar o link de novo não resolve. Use o card de diagnóstico do ML com esse'
        + ' MLB para ver o que faltou (título, preço ou foto).'
      ].join(' ');
    }

    if (corpo?.erro) return [corpo.erro, corpo.comoResolver].filter(Boolean).join(' ');
    return this.mensagemErroRede(e?.status);
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

  deletarSelecionados(): void {
    const ids = this.linksSelecionados().map(l => l.id!);
    if (!ids.length) return;

    const confirmacao = ids.length === 1
      ? 'Remover o link selecionado?'
      : `Remover os ${ids.length} links selecionados?`;
    if (!confirm(confirmacao)) return;

    this.apagarEmLote(ids);
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
