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

export interface LinkFixo {
  id?: number;
  mlbId: string;
  /** Nulo enquanto o item está pendente (capturado pelo bot, sem link de afiliado). */
  linkAfiliado?: string | null;
  ativo?: boolean;

  // Snapshot do produto capturado pelo bot (usado na revisão e na publicação)
  titulo?: string;
  precoAtual?: number;
  precoOriginal?: number;
  percentualDesconto?: number;
  urlImagem?: string;
  urlProduto?: string;
  categoria?: string;
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
  endpoint: string;
  paraQueServe: string;
  ok: boolean;
  status: number;
  amostra?: string;
  resposta?: string;
  causaProvavel?: string;
}

export interface DiagnosticoMl {
  token: { ok: boolean; mensagem?: string; erro?: string; comoResolver?: string };
  testes?: TesteDiagnostico[];
  conta?: { identificada: boolean; pareceVendedor?: boolean; observacao: string };
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

  // POST /api/aliexpress/executar
  executarAliexpress(): Observable<ExecutarResponse> {
    return this.http.post<ExecutarResponse>(`${this._baseUrl()}/api/aliexpress/executar`, {})
      .pipe(catchError(this.handleError));
  }

  // POST /api/mercadolivre/linksfixos
  executarLinksFixos(): Observable<ExecutarResponse> {
    return this.http.post<ExecutarResponse>(`${this._baseUrl()}/api/mercadolivre/linksfixos`, {})
      .pipe(catchError(this.handleError));
  }

  // GET /api/links
  listarLinks(): Observable<LinkFixo[]> {
    return this.http.get<LinkFixo[]>(`${this._baseUrl()}/api/links`)
      .pipe(catchError(this.handleError));
  }

  // GET /api/links/pendentes — itens capturados pelo bot sem link de afiliado
  listarPendentes(): Observable<LinkFixo[]> {
    return this.http.get<LinkFixo[]>(`${this._baseUrl()}/api/links/pendentes`)
      .pipe(catchError(this.handleError));
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
   * ID cru. Com linkAfiliado o item já nasce ATIVO e pula a revisão manual.
   */
  adicionarLink(entrada: string, linkAfiliado?: string): Observable<LinkFixo> {
    const body: { entrada: string; linkAfiliado?: string } = { entrada };
    if (linkAfiliado?.trim()) body.linkAfiliado = linkAfiliado.trim();

    return this.http.post<LinkFixo>(`${this._baseUrl()}/api/links`, body)
      .pipe(catchError(this.handleError));
  }

  // PATCH /api/links/{id}/afiliado — preenche o link de afiliado e já ativa
  definirAfiliado(id: number, linkAfiliado: string): Observable<LinkFixo> {
    return this.http.patch<LinkFixo>(`${this._baseUrl()}/api/links/${id}/afiliado`, { linkAfiliado })
      .pipe(catchError(this.handleError));
  }

  // PATCH /api/links/{id}/ativar
  ativarLink(id: number): Observable<LinkFixo> {
    return this.http.patch<LinkFixo>(`${this._baseUrl()}/api/links/${id}/ativar`, {})
      .pipe(catchError(this.handleError));
  }

  // PATCH /api/links/{id}/desativar
  desativarLink(id: number): Observable<LinkFixo> {
    return this.http.patch<LinkFixo>(`${this._baseUrl()}/api/links/${id}/desativar`, {})
      .pipe(catchError(this.handleError));
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
   */
  diagnosticarMl(): Observable<DiagnosticoMl> {
    return this.http.get<DiagnosticoMl>(`${this._baseUrl()}/api/mercadolivre/diagnostico`)
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
