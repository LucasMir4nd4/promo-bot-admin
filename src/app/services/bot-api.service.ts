import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

  // POST /api/amazon/executar
  executarAmazon(): Observable<ExecutarResponse> {
    return this.http.post<ExecutarResponse>(`${this._baseUrl()}/api/amazon/executar`, {})
      .pipe(catchError(this.handleError));
  }

  // POST /api/mercadolivre/executar
  executarMercadoLivre(): Observable<ExecutarResponse> {
    return this.http.post<ExecutarResponse>(`${this._baseUrl()}/api/mercadolivre/executar`, {})
      .pipe(catchError(this.handleError));
  }

  // POST /api/mercadolivre/buscarcategorias
  buscarCategorias(): Observable<ExecutarResponse> {
    return this.http.post<ExecutarResponse>(`${this._baseUrl()}/api/mercadolivre/buscarcategorias`, {})
      .pipe(catchError(this.handleError));
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

  private handleError(error: any): Observable<never> {
    console.error('[BotApiService] Erro na requisição:', error);
    return throwError(() => error);
  }
}
