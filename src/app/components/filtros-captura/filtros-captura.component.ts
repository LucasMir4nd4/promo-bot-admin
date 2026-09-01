import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  BotApiService,
  CatalogoCategorias,
  FiltroCaptura,
  FiltrosCaptura,
  FonteCaptura,
  ItemFiltro
} from '../../services/bot-api.service';

type Aba = 'ML_CATEGORIAS' | 'ALI_CATEGORIAS' | 'ALI_PALAVRAS';
type Estado = 'idle' | 'loading' | 'success' | 'error';

/**
 * Uma linha da grade de categorias: o que veio do catálogo do marketplace já
 * cruzado com o que está salvo nos filtros de captura.
 */
interface LinhaCategoria {
  /** O ID da categoria (MLB1648, 509) — é isso que vai no filtro. */
  id: string;
  nome: string;
  parentId?: string | null;
  /** Marcada = está salva e será varrida. */
  selecionada: boolean;
  /** false só quando alguém desligou o filtro sem apagar (PATCH ativo). */
  ativo: boolean;
  /**
   * true quando a categoria está salva mas não apareceu no catálogo — uma
   * subcategoria do AliExpress com a tela mostrando só as raízes, ou um ID que
   * o marketplace aposentou. Sem esta linha ela sumiria da tela e continuaria
   * sendo varrida, que é o pior dos dois mundos.
   */
  foraDoCatalogo: boolean;
}

/** Uma palavra-chave do AliExpress. Não tem catálogo: é texto livre. */
interface LinhaPalavra {
  valor: string;
  ativo: boolean;
}

/**
 * A tela que decide o que o bot varre: categorias do Mercado Livre, categorias
 * do AliExpress e palavras-chave do AliExpress.
 *
 * Antes isso morava no application.yml e mudar o nicho era editar arquivo e
 * reiniciar o bot. Aqui é clique e salvar, e o próximo ciclo já usa.
 *
 * As categorias vêm do catálogo da própria API do marketplace (não são digitadas
 * na mão) porque um ID errado não dá erro visível: o marketplace só devolve zero
 * resultado, e a captura fica silenciosamente vazia por dias.
 */
@Component({
  selector: 'app-filtros-captura',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './filtros-captura.component.html',
  styleUrls: ['./filtros-captura.component.css']
})
export class FiltrosCapturaComponent implements OnInit {

  aba: Aba = 'ML_CATEGORIAS';

  estado: Estado = 'idle';
  salvando = false;
  capturando = false;
  mensagem: string | null = null;
  mensagemErro = false;

  categoriasMl: LinhaCategoria[] = [];
  categoriasAli: LinhaCategoria[] = [];
  palavras: LinhaPalavra[] = [];

  /** Avisos do backend quando um catálogo volta vazio (token vencido, cota). */
  avisoMl: string | null = null;
  avisoAli: string | null = null;

  /** Filtro de texto da grade — a árvore do AliExpress é grande demais para rolar. */
  busca = '';

  /** true traz as subcategorias do AliExpress junto com as raízes. */
  incluirSubcategorias = false;

  novaPalavra = '';

  /** Marca a aba como suja: sem isso o Salvar não distingue "não mexi" de "limpei tudo". */
  alterado: Record<Aba, boolean> = {
    ML_CATEGORIAS: false,
    ALI_CATEGORIAS: false,
    ALI_PALAVRAS: false
  };

  logs: string[] = [];

  constructor(private api: BotApiService) {}

  ngOnInit(): void {
    this.carregar();
  }

  // ─── Carga ────────────────────────────────────────────────────────────────

  /**
   * Busca o catálogo das duas fontes e os filtros salvos de uma vez.
   *
   * @param atualizar true faz o backend ignorar o cache de 6h e ir nas APIs.
   *                  É o botão "recarregar catálogo", para depois de
   *                  reautenticar no ML.
   */
  carregar(atualizar = false): void {
    this.estado = 'loading';
    this.mensagem = null;
    this.addLog(atualizar ? 'Recarregando catálogo nas APIs...' : 'Carregando categorias e filtros...');

    forkJoin({
      filtros: this.api.listarFiltros(),
      // Catálogo indisponível não pode derrubar a tela: sem ele ainda dá para
      // ver e editar o que está salvo, que é a parte que não depende de API.
      ml: this.api.catalogoMercadoLivre(atualizar).pipe(catchError(() => of(null))),
      ali: this.api.catalogoAliexpress(!this.incluirSubcategorias, atualizar).pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ filtros, ml, ali }) => {
        this.categoriasMl = this.montarLinhas(ml, filtros.mercadoLivre.categorias);
        this.categoriasAli = this.montarLinhas(ali, filtros.aliexpress.categorias);
        this.palavras = filtros.aliexpress.palavrasChave
          .map(f => ({ valor: f.valor, ativo: f.ativo }));

        this.avisoMl = ml?.mensagem ?? (ml ? null : 'Não foi possível consultar o catálogo do Mercado Livre.');
        this.avisoAli = ali?.mensagem ?? (ali ? null : 'Não foi possível consultar o catálogo do AliExpress.');

        this.alterado = { ML_CATEGORIAS: false, ALI_CATEGORIAS: false, ALI_PALAVRAS: false };
        this.estado = 'idle';
        this.addLog(`✓ ${filtros.ativos} filtro(s) ativo(s) de ${filtros.total} salvo(s).`);
      },
      error: (err) => {
        this.estado = 'error';
        this.definirMensagem(
          err?.error?.erro || 'Falha ao carregar os filtros. Verifique se o bot está online.', true);
      }
    });
  }

  /** Cruza catálogo com o que está salvo, mantendo o salvo que não veio no catálogo. */
  private montarLinhas(catalogo: CatalogoCategorias | null, salvos: FiltroCaptura[]): LinhaCategoria[] {
    const porId = new Map<string, FiltroCaptura>(salvos.map(f => [f.valor, f]));

    const linhas: LinhaCategoria[] = (catalogo?.categorias ?? []).map(c => ({
      id: c.id,
      nome: c.nome,
      parentId: c.parentId,
      selecionada: porId.has(c.id),
      ativo: porId.get(c.id)?.ativo ?? true,
      foraDoCatalogo: false
    }));

    const noCatalogo = new Set(linhas.map(l => l.id));
    for (const f of salvos) {
      if (noCatalogo.has(f.valor)) continue;
      linhas.push({
        id: f.valor,
        nome: f.rotulo || '(fora do catálogo atual)',
        selecionada: true,
        ativo: f.ativo,
        foraDoCatalogo: true
      });
    }

    return linhas;
  }

  // ─── Edição ───────────────────────────────────────────────────────────────

  get linhasDaAba(): LinhaCategoria[] {
    const linhas = this.aba === 'ML_CATEGORIAS' ? this.categoriasMl : this.categoriasAli;
    const termo = this.busca.trim().toLowerCase();
    if (!termo) return linhas;
    return linhas.filter(l =>
      l.nome.toLowerCase().includes(termo) || l.id.toLowerCase().includes(termo));
  }

  /** Contadores dos badges das abas. */
  get marcadasMl(): number {
    return this.categoriasMl.filter(l => l.selecionada).length;
  }

  get marcadasAli(): number {
    return this.categoriasAli.filter(l => l.selecionada).length;
  }

  get selecionadasDaAba(): number {
    const linhas = this.aba === 'ML_CATEGORIAS' ? this.categoriasMl : this.categoriasAli;
    return linhas.filter(l => l.selecionada).length;
  }

  trocarAba(aba: Aba): void {
    this.aba = aba;
    this.busca = '';
    this.mensagem = null;
  }

  alternarCategoria(linha: LinhaCategoria): void {
    linha.selecionada = !linha.selecionada;
    // Desmarcar e remarcar não deve deixar a categoria desligada por engano.
    if (linha.selecionada) linha.ativo = true;
    this.alterado[this.aba] = true;
  }

  adicionarPalavra(): void {
    const termo = this.novaPalavra.trim();
    if (!termo) return;

    if (this.palavras.some(p => p.valor.toLowerCase() === termo.toLowerCase())) {
      this.definirMensagem(`"${termo}" já está na lista.`, true);
      return;
    }

    this.palavras.push({ valor: termo, ativo: true });
    this.novaPalavra = '';
    this.alterado.ALI_PALAVRAS = true;
  }

  removerPalavra(indice: number): void {
    this.palavras.splice(indice, 1);
    this.alterado.ALI_PALAVRAS = true;
  }

  /**
   * Liga/desliga uma palavra-chave sem apagá-la.
   *
   * Só existe aqui, e não na grade de categorias, porque palavra-chave não tem
   * catálogo: apagar "placa de vídeo" e querer de volta significa redigitar,
   * enquanto uma categoria é achar de novo na lista ao lado.
   */
  alternarPalavra(palavra: LinhaPalavra): void {
    palavra.ativo = !palavra.ativo;
    this.alterado.ALI_PALAVRAS = true;
  }

  // ─── Salvar ───────────────────────────────────────────────────────────────

  /** Salva só a aba aberta: o PUT ignora os blocos que não vão no corpo. */
  salvar(): void {
    if (this.salvando) return;
    this.salvando = true;
    this.mensagem = null;

    const corpo = this.corpoDaAba();
    const quantos = this.aba === 'ALI_PALAVRAS'
      ? this.palavras.length
      : this.selecionadasDaAba;

    this.addLog(`Salvando ${quantos} item(ns) em ${this.rotuloDaAba()}...`);

    this.api.salvarFiltros(corpo).subscribe({
      next: (res) => {
        this.salvando = false;
        this.alterado[this.aba] = false;
        this.definirMensagem(res.mensagem ?? 'Filtros salvos.', false);
        this.addLog(`✓ ${this.rotuloDaAba()}: ${quantos} item(ns) salvos.`);
      },
      error: (err) => {
        this.salvando = false;
        this.definirMensagem(err?.error?.erro || 'Falha ao salvar os filtros.', true);
        this.addLog('✗ Falha ao salvar.');
      }
    });
  }

  private corpoDaAba() {
    const deCategorias = (linhas: LinhaCategoria[]): ItemFiltro[] => linhas
      .filter(l => l.selecionada)
      .map(l => ({
        valor: l.id,
        rotulo: l.foraDoCatalogo ? undefined : l.nome,
        ativo: l.ativo
      }));

    switch (this.aba) {
      case 'ML_CATEGORIAS':
        return { mercadoLivre: { categorias: deCategorias(this.categoriasMl) } };
      case 'ALI_CATEGORIAS':
        return { aliexpress: { categorias: deCategorias(this.categoriasAli) } };
      case 'ALI_PALAVRAS':
        return {
          aliexpress: {
            palavrasChave: this.palavras.map(p => ({ valor: p.valor, ativo: p.ativo }))
          }
        };
    }
  }

  // ─── Capturar ─────────────────────────────────────────────────────────────

  /**
   * Dispara a captura com o que está SALVO (não com o que está na tela).
   *
   * Roda em background no backend, então a resposta só confirma o disparo. O
   * efeito muda por fonte: o Mercado Livre enfileira para o worker gerar o link
   * de afiliado, o AliExpress publica direto nos canais.
   */
  capturar(fonte: FonteCaptura | 'AMBAS'): void {
    if (this.capturando) return;

    if (this.alterado[this.aba]) {
      this.definirMensagem('Salve as alterações antes: a captura usa o que está salvo.', true);
      return;
    }

    this.capturando = true;
    this.mensagem = null;
    this.addLog(`Disparando captura (${fonte})...`);

    this.api.executarCaptura({ fonte }).subscribe({
      next: (res) => {
        this.capturando = false;
        this.definirMensagem(res.mensagem, false);

        const ml = res.disparado?.mercadoLivre;
        const ali = res.disparado?.aliexpress;
        if (ml) this.addLog(`✓ ML: ${ml.categorias.length} categoria(s) na varredura.`);
        if (ali) {
          this.addLog(`✓ AliExpress: ${ali.palavrasChave.length} palavra(s)-chave e ` +
                      `${ali.categorias.length} categoria(s).`);
        }
      },
      error: (err) => {
        this.capturando = false;
        this.definirMensagem(err?.error?.erro || 'Falha ao disparar a captura.', true);
        this.addLog('✗ Falha ao disparar a captura.');
      }
    });
  }

  // ─── Helpers de tela ──────────────────────────────────────────────────────

  rotuloDaAba(): string {
    switch (this.aba) {
      case 'ML_CATEGORIAS': return 'categorias do Mercado Livre';
      case 'ALI_CATEGORIAS': return 'categorias do AliExpress';
      case 'ALI_PALAVRAS': return 'palavras-chave do AliExpress';
    }
  }

  get avisoDaAba(): string | null {
    if (this.aba === 'ML_CATEGORIAS') return this.avisoMl;
    if (this.aba === 'ALI_CATEGORIAS') return this.avisoAli;
    return null;
  }

  /** O catálogo do AliExpress recarrega porque raiz/subcategorias é filtro do backend. */
  alternarSubcategorias(): void {
    this.incluirSubcategorias = !this.incluirSubcategorias;
    this.carregar();
  }

  private definirMensagem(texto: string, erro: boolean): void {
    this.mensagem = texto;
    this.mensagemErro = erro;
    setTimeout(() => { if (this.mensagem === texto) this.mensagem = null; }, 6000);
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
