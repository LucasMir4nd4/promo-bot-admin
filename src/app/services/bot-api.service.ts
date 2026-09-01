import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';

export interface HealthResponse {
  status: string;
  totalProdutosEnviados: number;
  uptime?: string;
  versao?: string;
}

export interface ProdutoEnviado {
  id?: number;
  asin: string;
  titulo: string;
  precoAtual?: number;
  precoOriginal?: number;
  percentualDesconto?: number;
  categoria?: string;
  enviadoEm: string;
  urlAfiliado?: string;
  urlImagem?: string;
  enviadoTelegram?: boolean;
  enviadoWhatsapp?: boolean;
}

export interface ExecutarResponse {
  mensagem?: string;
  message?: string;
  produtosEnviados?: number;
  timestamp?: string;
}

/** Item de GET /api/mercadolivre/buscarcategorias — categoria raiz do ML. */
export interface CategoriaMl {
  id: string;
  nome: string;
}

/** As duas fontes de promoção que o bot varre. */
export type FonteCaptura = 'MERCADO_LIVRE' | 'ALIEXPRESS';

/**
 * Como a busca é feita numa fonte. O Mercado Livre só aceita CATEGORIA
 * (highlights); o AliExpress aceita as duas e usa as duas.
 */
export type TipoFiltro = 'CATEGORIA' | 'PALAVRA_CHAVE';

/**
 * Uma categoria de marketplace, no mesmo formato para ML e AliExpress
 * (GET /api/categorias/...). 'selecionada' já vem calculada do backend.
 */
export interface Categoria {
  id: string;
  nome: string;
  /** null nas raízes. Só o AliExpress devolve subcategorias. */
  parentId?: string | null;
  raiz: boolean;
  fonte: FonteCaptura;
  selecionada: boolean;
}

/**
 * O envelope do catálogo. 'mensagem' só aparece quando a lista volta vazia — e
 * é o que separa "o marketplace não tem categorias" de "o token venceu".
 */
export interface CatalogoCategorias {
  fonte: FonteCaptura;
  quantidade: number;
  selecionadas: number;
  apenasRaiz?: boolean;
  categorias: Categoria[];
  mensagem?: string;
}

/** Uma categoria ou palavra-chave salva em /api/captura/filtros. */
export interface FiltroCaptura {
  id: number;
  fonte: FonteCaptura;
  tipo: TipoFiltro;
  /** O ID da categoria (MLB1648, 509) ou o termo de busca ("ssd nvme"). */
  valor: string;
  /** Nome legível da categoria; null nas palavras-chave. */
  rotulo?: string | null;
  /** false = salvo, mas fora da varredura. */
  ativo: boolean;
}

/** GET /api/captura/filtros — tudo que está salvo, agrupado. */
export interface FiltrosCaptura {
  mercadoLivre: { categorias: FiltroCaptura[] };
  aliexpress: { categorias: FiltroCaptura[]; palavrasChave: FiltroCaptura[] };
  total: number;
  ativos: number;
}

/** Um item no PUT em lote. Sem 'ativo' o backend salva ligado. */
export interface ItemFiltro {
  valor: string;
  rotulo?: string | null;
  ativo?: boolean;
}

/**
 * Corpo do PUT /api/captura/filtros. Bloco ausente não é mexido — a tela salva
 * uma aba por vez e não pode apagar o que está em outra.
 */
export interface SalvarFiltros {
  mercadoLivre?: { categorias?: ItemFiltro[] };
  aliexpress?: { categorias?: ItemFiltro[]; palavrasChave?: ItemFiltro[] };
}

/** Resposta de POST /api/captura/executar. */
export interface CapturaDisparada {
  disparado: {
    mercadoLivre?: { categorias: string[]; avulso: boolean; efeito: string };
    aliexpress?: { palavrasChave: string[]; categorias: string[]; avulso: boolean; efeito: string };
  };
  timestamp: string;
  mensagem: string;
}

export interface LinkFixo {
  id?: number;
  mlbId: string;
  /**
   * Link curto do botão Compartilhar (https://meli.la/…). Sempre preenchido:
   * um LinkFixo só nasce quando o link de afiliado existe — a oferta ainda sem
   * link fica na fila em memória do bot, não aqui (ver OfertaNaFila).
   */
  linkAfiliado: string;
  ativo?: boolean;

  // Snapshot do produto, usado para montar a mensagem na publicação
  titulo?: string;
  precoAtual?: number;
  precoOriginal?: number;
  percentualDesconto?: number;
  urlImagem?: string;
  urlProduto?: string;
  categoria?: string;
}

/**
 * Uma linha de GET /api/links/fila.txt — oferta capturada pelo bot que ainda
 * espera o link de afiliado. Vive só na memória do backend: reiniciar o bot
 * esvazia a fila, e o próximo ciclo de captura a enche de novo.
 */
export interface OfertaNaFila {
  mlbId: string;
  urlProduto: string;
}

/** Espelha o ProdutoDTO do backend — o snapshot que o ML devolve para um anúncio. */
export interface ProdutoMl {
  asin: string;
  titulo?: string;
  precoAtual?: number;
  precoOriginal?: number;
  percentualDesconto?: number;
  urlImagem?: string;
  urlProduto?: string;
  urlAfiliado?: string;
  categoria?: string;
  fonte?: string;
}

/** Os tipos de ID que o Mercado Livre usa. Só ITEM é publicável direto. */
export type TipoIdMl = 'ITEM' | 'CATALOG_PRODUCT' | 'USER_PRODUCT' | 'DESCONHECIDO';

/**
 * Resposta de POST /api/links/preview — o que o bot entendeu do link colado,
 * antes de gravar. É o que alimenta o card de confirmação da tela.
 */
export interface LinkPreview {
  /** Único campo que libera o botão de confirmar. */
  utilizavel: boolean;
  entrada: string;
  tipoDetectado: TipoIdMl;
  /** O ID como veio na URL — pode ser o do catálogo. */
  idDetectado?: string | null;
  /** O ID do anúncio já resolvido. É este que vai para o banco. */
  mlbId?: string | null;
  resolvidoDeCatalogo: boolean;
  jaCadastrado: boolean;
  jaPublicado: boolean;
  produto?: ProdutoMl | null;
  /** OK | SEM_SNAPSHOT | ID_INVALIDO | ID_DE_CATALOGO | CATALOGO_SEM_VENCEDOR | JA_NA_FILA | JA_PUBLICADO */
  motivo: string;
  mensagem: string;
  comoResolver?: string | null;
}

/**
 * Resposta de POST /api/links/compartilhado — o par (link de afiliado + página
 * do produto) já gravado, e o que aconteceu com a publicação.
 */
export interface LinkCompartilhadoResposta {
  id: number;
  mlbId: string;
  titulo?: string | null;
  linkAfiliado: string;
  /** false quando 'publicar' veio false, ou quando a mensagem não saiu em canal nenhum. */
  publicado: boolean;
  mensagem: string;
}

/** Resposta de DELETE /api/links (exclusão em lote). */
export interface ExclusaoLoteResposta {
  removidos: number;
  ids: number[];
  naoEncontrados: number[];
  mensagem: string;
}

/** Um endpoint sondado por GET /api/mercadolivre/diagnostico. */
export interface TesteDiagnostico {
  nome: string;
  /** Ausente no teste 'item' quando nem deu para escolher um anúncio. */
  endpoint?: string;
  paraQueServe: string;
  ok: boolean;
  status?: number;
  amostra?: string;
  resposta?: string;
  causaProvavel?: string;

  // Só no teste 'item' (GET /items/{id}) — os três campos que a mensagem
  // publicada usa. É aqui que se vê a promoção sair "pelada": o ML pode
  // responder 200 e ainda assim vir sem título ou com preço 0.
  titulo?: string;
  preco?: number;
  temFoto?: boolean;
  statusDoAnuncio?: string;
}

export interface DiagnosticoMl {
  token: { ok: boolean; mensagem?: string; erro?: string; comoResolver?: string };
  testes?: TesteDiagnostico[];
  conta?: { identificada: boolean; pareceVendedor?: boolean; observacao: string };
  conclusao: string;
}

/**
 * GET /api/worker — a chave liga/desliga do worker de automação (o Python que
 * gera os links de afiliado no Chrome) e o último sinal de vida dele.
 *
 * 'ativo' e 'online' são independentes de propósito: o painel não sobe nem mata
 * o processo, então "eu pausei" (online + inativo) e "esqueci de iniciar o
 * Python" (offline) precisam aparecer diferentes — se resolvem de jeitos
 * diferentes.
 */
export interface WorkerEstado {
  /** A chave. false faz o worker parar de gerar link no próximo giro. */
  ativo: boolean;
  /** Deu sinal de vida há menos de ~3 giros. */
  online: boolean;
  /** OFFLINE | PAUSADO | PUBLICANDO — as três combinações que importam. */
  situacao: 'OFFLINE' | 'PAUSADO' | 'PUBLICANDO';
  alteradoEm: string;
  ultimoSinal: string | null;
  segundosDesdeUltimoSinal: number | null;
  /** 'automatico+manual' quando o worker também escuta o clipboard. */
  modo?: string | null;
  naFila?: number | null;
  explicacao: string;
}

/** Resposta de POST /api/worker/ativo — o estado já atualizado. */
export interface WorkerAlteracao extends WorkerEstado {
  /** false quando o worker já estava nesse estado (clique repetido). */
  mudou: boolean;
  mensagem: string;
}

/** Bloco 'configuracao' de GET /api/openai/diagnostico. */
export interface ConfiguracaoOpenAi {
  chaveConfigurada: boolean;
  /** Mascarada no backend: ponta e cauda só, para conferir qual chave é. */
  chave: string;
  tamanhoDaChave: number;
  modelo: string;
  url: string;
  perfisAtivos: string[];
  /** Avisa quando o perfil 'mock' está ativo e a OpenAI nem é chamada. */
  clienteEmUso: string;
}

export interface TesteOpenAi {
  nome: string;
  endpoint: string;
  paraQueServe: string;
  ok?: boolean;
  status?: number;
  amostra?: string;
  resposta?: string;
  causaProvavel?: string;
  /** Só no teste 'copy': o que a chamada real devolveu. */
  modeloQueRespondeu?: string;
  tokensUsados?: number;
}

/**
 * GET /api/openai/diagnostico — chave, modelo e uma geração de copy de verdade.
 *
 * Vale ter na tela porque a falha aqui é silenciosa: o OpenAiClient engole o
 * erro e publica com um texto genérico, então a integração pode estar morta há
 * semanas sem nenhum sintoma no Telegram nem no WhatsApp.
 */
export interface DiagnosticoOpenAi {
  configuracao: ConfiguracaoOpenAi;
  impacto: string;
  testes?: TesteOpenAi[];
  conclusao: string;
}

export interface MlAuthLoginResponse {
  urlAutorizacao: string;
  state: string;
}

export interface MlAuthSeedResponse {
  status: string;
  mensagem?: string;
  userId?: number | string;
  scope?: string;
  expiraEm?: string;
}

/** GET /api/whatsapp/config — defaults que o front usa pra montar a tela. */
export interface WhatsAppConfig {
  instanciaPadrao: string;
  reiniciarPadrao: boolean;
}

/** POST /api/whatsapp/instancias/conectar */
export interface WhatsAppConexao {
  instancia: string;
  reiniciada: boolean;
  anteriorRemovida: boolean;
  criada: boolean;
  estado: string;
  /** data URI pronto para <img src="...">; vem null quando já está conectada */
  qrcode: string | null;
  pairingCode: string | null;
  qrcodeImagemUrl: string;
}

export interface WhatsAppStatus {
  instancia: string;
  estado: string;
  conectada: boolean;
}

export interface WhatsAppInstancia {
  [campo: string]: any;
}

export interface WhatsAppGrupo {
  id?: string;
  subject?: string;
  size?: number;
  [campo: string]: any;
}

interface EnviadosResponse {
  quantidade: number;
  periodo: string;
  produtos: ProdutoEnviado[];
}

@Injectable({ providedIn: 'root' })
export class BotApiService {

  // URL base configurável — pode ser alterada pelo usuário no painel
  private _baseUrl = signal<string>(
    localStorage.getItem('bot_base_url') || 'http://localhost:8081'
  );

  readonly baseUrl = this._baseUrl.asReadonly();

  constructor(private http: HttpClient) {}

  // Atualiza a URL base e persiste no localStorage
  setBaseUrl(url: string): void {
    const clean = url.replace(/\/$/, ''); // remove barra final
    this._baseUrl.set(clean);
    localStorage.setItem('bot_base_url', clean);
  }

  // GET /api/health
  getHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this._baseUrl()}/api/health`)
      .pipe(catchError(this.handleError));
  }

  // POST /api/mercadolivre/executar
  executarMercadoLivre(): Observable<ExecutarResponse> {
    return this.http.post<ExecutarResponse>(`${this._baseUrl()}/api/mercadolivre/executar`, {})
      .pipe(catchError(this.handleError));
  }

  // GET /api/mercadolivre/buscarcategorias — lista as categorias raiz do ML
  buscarCategorias(): Observable<CategoriaMl[]> {
    return this.http.get<CategoriaMl[]>(`${this._baseUrl()}/api/mercadolivre/buscarcategorias`)
      .pipe(
        map(res => res ?? []),
        catchError(this.handleError)
      );
  }

  // ─── Categorias e palavras-chave da captura ────────────────────────────────

  /**
   * GET /api/categorias/mercadolivre — as categorias raiz de MLB.
   *
   * @param atualizar true ignora o cache de 6h do backend e vai na API do ML.
   *                  Use depois de reautenticar: um catálogo vazio por token
   *                  vencido ficaria em cache até o fim das 6h.
   */
  catalogoMercadoLivre(atualizar = false): Observable<CatalogoCategorias> {
    const params = new HttpParams().set('atualizar', String(atualizar));
    return this.http.get<CatalogoCategorias>(
      `${this._baseUrl()}/api/categorias/mercadolivre`, { params }
    ).pipe(catchError(this.handleError));
  }

  /**
   * GET /api/categorias/aliexpress — o catálogo do AliExpress.
   *
   * @param raiz true (padrão) traz só o primeiro nível, que é o que serve para
   *             varrer um nicho. false traz a árvore inteira, com o parentId.
   */
  catalogoAliexpress(raiz = true, atualizar = false): Observable<CatalogoCategorias> {
    const params = new HttpParams()
      .set('raiz', String(raiz))
      .set('atualizar', String(atualizar));
    return this.http.get<CatalogoCategorias>(
      `${this._baseUrl()}/api/categorias/aliexpress`, { params }
    ).pipe(catchError(this.handleError));
  }

  // POST /api/categorias/cache/limpar
  limparCacheCategorias(): Observable<{ limpo: boolean; mensagem: string }> {
    return this.http.post<{ limpo: boolean; mensagem: string }>(
      `${this._baseUrl()}/api/categorias/cache/limpar`, {}
    ).pipe(catchError(this.handleError));
  }

  // GET /api/captura/filtros — o que está salvo para ser varrido
  listarFiltros(): Observable<FiltrosCaptura> {
    return this.http.get<FiltrosCaptura>(`${this._baseUrl()}/api/captura/filtros`)
      .pipe(catchError(this.handleError));
  }

  /**
   * PUT /api/captura/filtros — salva a seleção de uma aba.
   *
   * Manda só o bloco editado: o backend deixa intocado o que não veio no corpo,
   * então salvar as palavras-chave não apaga as categorias.
   */
  salvarFiltros(payload: SalvarFiltros): Observable<{ filtros: FiltrosCaptura; mensagem: string }> {
    return this.http.put<{ filtros: FiltrosCaptura; mensagem: string }>(
      `${this._baseUrl()}/api/captura/filtros`, payload
    ).pipe(catchError(this.handleError));
  }

  // POST /api/captura/filtros — cadastra um filtro avulso (valor repetido não duplica)
  adicionarFiltro(fonte: FonteCaptura, tipo: TipoFiltro, valor: string, rotulo?: string):
      Observable<{ filtro: FiltroCaptura; mensagem: string }> {
    return this.http.post<{ filtro: FiltroCaptura; mensagem: string }>(
      `${this._baseUrl()}/api/captura/filtros`, { fonte, tipo, valor, rotulo }
    ).pipe(catchError(this.handleError));
  }

  // PATCH /api/captura/filtros/{id} — liga/desliga sem apagar
  alternarFiltro(id: number, ativo: boolean): Observable<{ filtro: FiltroCaptura; mensagem: string }> {
    return this.http.patch<{ filtro: FiltroCaptura; mensagem: string }>(
      `${this._baseUrl()}/api/captura/filtros/${id}`, { ativo }
    ).pipe(catchError(this.handleError));
  }

  // DELETE /api/captura/filtros/{id}
  removerFiltro(id: number): Observable<{ removido: number; mensagem: string }> {
    return this.http.delete<{ removido: number; mensagem: string }>(
      `${this._baseUrl()}/api/captura/filtros/${id}`
    ).pipe(catchError(this.handleError));
  }

  /**
   * POST /api/captura/executar — dispara a busca de promoções.
   *
   * Sem corpo roda o que está salvo e ativo nas duas fontes. Com 'categorias' ou
   * 'palavrasChave' faz uma varredura avulsa (exige uma fonte só) — dá para
   * testar uma categoria nova sem salvá-la antes.
   *
   * O efeito difere por fonte: o Mercado Livre só ENFILEIRA (a publicação espera
   * o worker gerar o link de afiliado) e o AliExpress PUBLICA na hora.
   */
  executarCaptura(corpo?: {
    fonte?: FonteCaptura | 'AMBAS';
    categorias?: string[];
    palavrasChave?: string[];
  }): Observable<CapturaDisparada> {
    return this.http.post<CapturaDisparada>(
      `${this._baseUrl()}/api/captura/executar`, corpo ?? {}
    ).pipe(catchError(this.handleError));
  }

  // POST /api/aliexpress/executar
  executarAliexpress(): Observable<ExecutarResponse> {
    return this.http.post<ExecutarResponse>(`${this._baseUrl()}/api/aliexpress/executar`, {})
      .pipe(catchError(this.handleError));
  }

  // GET /api/links
  listarLinks(): Observable<LinkFixo[]> {
    return this.http.get<LinkFixo[]>(`${this._baseUrl()}/api/links`)
      .pipe(catchError(this.handleError));
  }

  /**
   * GET /api/links/fila.txt — as ofertas capturadas esperando link de afiliado.
   *
   * O backend responde text/plain (uma linha por oferta, mlbId TAB urlProduto)
   * porque quem consome de verdade é o worker de automação, que não tem parser
   * de JSON. A conversão aqui é trivial, e vale mais reaproveitar o mesmo
   * endpoint do que pedir um JSON só para a tela.
   */
  listarFila(): Observable<OfertaNaFila[]> {
    return this.http.get(`${this._baseUrl()}/api/links/fila.txt`, { responseType: 'text' })
      .pipe(
        map(texto => (texto ?? '')
          .split('\n')
          .map(linha => linha.trim())
          .filter(linha => linha.length > 0)
          .map(linha => {
            const [mlbId, urlProduto] = linha.split('\t');
            return { mlbId, urlProduto: urlProduto ?? '' };
          })),
        catchError(this.handleError)
      );
  }

  /**
   * POST /api/links/preview — analisa o link SEM gravar nada.
   *
   * Passo 1 do cadastro por URL: devolve o tipo do ID, o anúncio já resolvido
   * (quando a URL era de catálogo) e o snapshot, para a tela mostrar um card de
   * confirmação. Uma entrada inválida volta 200 com utilizavel: false — não é
   * erro de HTTP, é o resultado normal da análise.
   */
  preverLink(entrada: string): Observable<LinkPreview> {
    return this.http.post<LinkPreview>(`${this._baseUrl()}/api/links/preview`, { entrada })
      .pipe(catchError(this.handleError));
  }

  /**
   * POST /api/links — cadastra a partir de uma URL colada ou de um ID.
   *
   * Aceita URL de anúncio, URL de catálogo (/p/MLB…, resolvida no backend) e o
   * ID cru. Com linkAfiliado o item nasce ATIVO e publicável.
   *
   * O backend ainda aceita o body sem linkAfiliado, mas a tela não usa esse
   * caminho: os PATCH que preenchiam o link depois deixaram de existir, então
   * a linha ficaria inativa sem nenhuma forma de completá-la.
   */
  adicionarLink(entrada: string, linkAfiliado?: string): Observable<LinkFixo> {
    const body: { entrada: string; linkAfiliado?: string } = { entrada };
    if (linkAfiliado?.trim()) body.linkAfiliado = linkAfiliado.trim();

    return this.http.post<LinkFixo>(`${this._baseUrl()}/api/links`, body)
      .pipe(catchError(this.handleError));
  }

  /**
   * POST /api/links/compartilhado — grava o link de afiliado copiado do modal
   * "Compartilhar" do anúncio e, por padrão, publica a promoção na hora.
   *
   * Os dois campos são obrigatórios: o link curto (meli.la/…) não diz de qual
   * produto ele é — quem carrega o MLB é a URL da página que estava aberta.
   *
   * Diferente de POST /api/links, um anúncio que já está na fila NÃO é conflito
   * aqui: é o caminho normal (o bot capturou, o link de afiliado chega depois),
   * e a chamada só preenche a lacuna e ativa o item.
   */
  registrarCompartilhado(
    linkAfiliado: string,
    paginaProduto: string,
    publicar = true
  ): Observable<LinkCompartilhadoResposta> {
    return this.http.post<LinkCompartilhadoResposta>(
      `${this._baseUrl()}/api/links/compartilhado`,
      { linkAfiliado: linkAfiliado.trim(), paginaProduto: paginaProduto.trim(), publicar }
    ).pipe(catchError(this.handleError));
  }

  // DELETE /api/links/{id}
  deletarLink(id: number): Observable<{ mensagem: string }> {
    return this.http.delete<{ mensagem: string }>(`${this._baseUrl()}/api/links/${id}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * DELETE /api/links — apaga vários de uma vez.
   *
   * Uma chamada só em vez de N em paralelo: o backend resolve tudo numa
   * transação e ainda informa quais IDs já não existiam ('naoEncontrados'),
   * o que deixa a tela se reconciliar sem tratar 404 item a item.
   */
  deletarLinks(ids: number[]): Observable<ExclusaoLoteResposta> {
    return this.http.delete<ExclusaoLoteResposta>(`${this._baseUrl()}/api/links`, { body: { ids } })
      .pipe(catchError(this.handleError));
  }

  /**
   * DELETE /api/links/todos?confirmar=true — limpa a tabela inteira.
   * Sem confirmar=true o backend devolve 400 com a contagem, como prévia.
   */
  deletarTodosLinks(confirmar = true): Observable<{ removidos: number; mensagem: string }> {
    return this.http.delete<{ removidos: number; mensagem: string }>(
      `${this._baseUrl()}/api/links/todos`, { params: new HttpParams().set('confirmar', String(confirmar)) }
    ).pipe(catchError(this.handleError));
  }

  /**
   * GET /api/mercadolivre/diagnostico — sonda cada endpoint do ML que o bot usa.
   * Serve para separar "token quebrado" de "aplicação bloqueada por política do ML".
   *
   * Com `item` (um MLB…), o teste de GET /items/{id} aponta para esse anúncio em
   * vez de um dos destaques — é assim que se investiga uma promoção específica
   * que saiu sem foto e sem preço. Sem ele o backend escolhe o primeiro anúncio
   * dos highlights, que é a mesma fonte da captura automática.
   */
  diagnosticarMl(item?: string): Observable<DiagnosticoMl> {
    let params = new HttpParams();
    if (item?.trim()) params = params.set('item', item.trim());

    return this.http.get<DiagnosticoMl>(
      `${this._baseUrl()}/api/mercadolivre/diagnostico`, { params }
    ).pipe(catchError(this.handleError));
  }

  /**
   * GET /api/openai/diagnostico — a chamada gasta alguns tokens de verdade: o
   * teste 'copy' gera texto pelo mesmo caminho da publicação, porque só a
   * chamada real prova que o caminho que o bot usa funciona.
   */
  diagnosticarOpenAi(): Observable<DiagnosticoOpenAi> {
    return this.http.get<DiagnosticoOpenAi>(`${this._baseUrl()}/api/openai/diagnostico`)
      .pipe(catchError(this.handleError));
  }

  // ─── Worker de automação (o Python dos links de afiliado) ──────────────────

  // GET /api/worker
  estadoWorker(): Observable<WorkerEstado> {
    return this.http.get<WorkerEstado>(`${this._baseUrl()}/api/worker`)
      .pipe(catchError(this.handleError));
  }

  /**
   * POST /api/worker/ativo — a chave liga/desliga.
   *
   * Não inicia nem mata o processo Python: ele é iniciado na mão, depois do
   * Chrome de afiliado estar aberto. Desligar aqui faz o worker parar de gerar
   * link no próximo giro, mantendo a conexão com o Chrome — que é a parte cara
   * de recuperar.
   */
  definirWorkerAtivo(ativo: boolean): Observable<WorkerAlteracao> {
    return this.http.post<WorkerAlteracao>(`${this._baseUrl()}/api/worker/ativo`, { ativo })
      .pipe(catchError(this.handleError));
  }

  // GET /api/enviados?horas=N
  getEnviados(horas: number = 24): Observable<ProdutoEnviado[]> {
    return this.http.get<EnviadosResponse>(`${this._baseUrl()}/api/enviados?horas=${horas}`)
      .pipe(
        map(res => res.produtos ?? []),
        catchError(this.handleError)
      );
  }

  // GET /api/ml/auth/login — retorna a URL de autorização OAuth2 do Mercado Livre
  mlAuthLogin(): Observable<MlAuthLoginResponse> {
    return this.http.get<MlAuthLoginResponse>(`${this._baseUrl()}/api/ml/auth/login`)
      .pipe(catchError(this.handleError));
  }

  // POST /api/ml/auth/seed — bootstrap manual colando um refresh_token
  mlAuthSeed(refreshToken: string): Observable<MlAuthSeedResponse> {
    return this.http.post<MlAuthSeedResponse>(`${this._baseUrl()}/api/ml/auth/seed`, { refreshToken })
      .pipe(catchError(this.handleError));
  }

  // ─── WhatsApp / Evolution API ──────────────────────────────────────────────

  // GET /api/whatsapp/config
  whatsappConfig(): Observable<WhatsAppConfig> {
    return this.http.get<WhatsAppConfig>(`${this._baseUrl()}/api/whatsapp/config`)
      .pipe(catchError(this.handleError));
  }

  // GET /api/whatsapp/instancias
  listarInstancias(): Observable<WhatsAppInstancia[]> {
    return this.http.get<WhatsAppInstancia[]>(`${this._baseUrl()}/api/whatsapp/instancias`)
      .pipe(catchError(this.handleError));
  }

  // POST /api/whatsapp/instancias/conectar?instancia=...&reiniciar=...
  conectarWhatsapp(instancia?: string, reiniciar?: boolean): Observable<WhatsAppConexao> {
    let params = new HttpParams();
    if (instancia?.trim()) params = params.set('instancia', instancia.trim());
    if (reiniciar !== undefined) params = params.set('reiniciar', String(reiniciar));

    return this.http.post<WhatsAppConexao>(
      `${this._baseUrl()}/api/whatsapp/instancias/conectar`, {}, { params }
    ).pipe(catchError(this.handleError));
  }

  // GET /api/whatsapp/instancias/{instancia}/status
  statusWhatsapp(instancia: string): Observable<WhatsAppStatus> {
    return this.http.get<WhatsAppStatus>(
      `${this._baseUrl()}/api/whatsapp/instancias/${encodeURIComponent(instancia)}/status`
    ).pipe(catchError(this.handleError));
  }

  /**
   * URL do QR Code em PNG servido pelo backend. O parâmetro `cacheBust` força o
   * navegador a rebuscar a imagem — sem ele o <img> reaproveita o QR já expirado.
   */
  qrCodeUrl(instancia: string, cacheBust: number = Date.now()): string {
    return `${this._baseUrl()}/api/whatsapp/instancias/${encodeURIComponent(instancia)}/qrcode.png?t=${cacheBust}`;
  }

  // GET /api/whatsapp/instancias/{instancia}/grupos
  listarGrupos(instancia: string): Observable<WhatsAppGrupo[]> {
    return this.http.get<WhatsAppGrupo[]>(
      `${this._baseUrl()}/api/whatsapp/instancias/${encodeURIComponent(instancia)}/grupos`
    ).pipe(catchError(this.handleError));
  }

  // POST /api/whatsapp/instancias/{instancia}/mensagem
  enviarMensagem(instancia: string, destino: string, texto: string): Observable<any> {
    return this.http.post<any>(
      `${this._baseUrl()}/api/whatsapp/instancias/${encodeURIComponent(instancia)}/mensagem`,
      { destino, texto }
    ).pipe(catchError(this.handleError));
  }

  // DELETE /api/whatsapp/instancias/{instancia}
  deletarInstancia(instancia: string): Observable<{ instancia: string; removida: boolean; mensagem: string }> {
    return this.http.delete<{ instancia: string; removida: boolean; mensagem: string }>(
      `${this._baseUrl()}/api/whatsapp/instancias/${encodeURIComponent(instancia)}`
    ).pipe(catchError(this.handleError));
  }

  private handleError(error: any): Observable<never> {
    console.error('[BotApiService] Erro na requisição:', error);
    return throwError(() => error);
  }
}
