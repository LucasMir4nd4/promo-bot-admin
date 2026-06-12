import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';

// Interface para o retorno do /api/health
export interface HealthResponse {
  status: string;
  totalProdutosEnviados: number;
  uptime?: string;
  versao?: string;
}

// Interface para cada produto enviado
export interface ProdutoEnviado {
  id?: number;
  asin: string;
  titulo: string;
  precoAtual?: number;
  precoOriginal?: number;
  percentualDesconto?: number;
  categoria?: string;
  canal?: string;
  enviadoEm: string;
  linkAfiliado?: string;
  imagemUrl?: string;
}

// Interface para o retorno do /api/executar
export interface ExecutarResponse {
  message: string;
  produtosEnviados?: number;
}

// Interface para o retorno do /api/enviados
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

  // GET /api/enviados?horas=N
  getEnviados(horas: number = 24): Observable<ProdutoEnviado[]> {
    return this.http.get<EnviadosResponse>(`${this._baseUrl()}/api/enviados?horas=${horas}`)
      .pipe(
        map(res => res.produtos ?? []),
        catchError(this.handleError)
      );
  }

  private handleError(error: any): Observable<never> {
    console.error('[BotApiService] Erro na requisição:', error);
    return throwError(() => error);
  }
}
