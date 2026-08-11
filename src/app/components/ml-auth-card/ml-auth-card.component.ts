import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BotApiService } from '../../services/bot-api.service';

type Estado = 'idle' | 'loading' | 'success' | 'error';

/**
 * Bootstrap manual do OAuth2 do Mercado Livre (feito 1x — depois o bot renova sozinho).
 *
 * Caminho A: GET /api/ml/auth/login -> abre a URL de autorização.
 * Caminho B: POST /api/ml/auth/seed -> cola um refresh_token obtido fora do bot.
 */
@Component({
  selector: 'app-ml-auth-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ml-auth-card.component.html',
  styleUrls: ['./ml-auth-card.component.css']
})
export class MlAuthCardComponent {

  estadoLogin: Estado = 'idle';
  urlAutorizacao: string | null = null;
  state: string | null = null;
  erroLogin: string | null = null;

  refreshToken = '';
  estadoSeed: Estado = 'idle';
  seedMensagem: string | null = null;
  seedDetalhe: string | null = null;

  constructor(private readonly api: BotApiService) {}

  /** GET /api/ml/auth/login — gera a URL de autorização e já abre numa aba nova. */
  gerarLogin(): void {
    if (this.estadoLogin === 'loading') return;

    this.estadoLogin = 'loading';
    this.erroLogin = null;

    this.api.mlAuthLogin().subscribe({
      next: (res) => {
        this.estadoLogin = 'success';
        this.urlAutorizacao = res.urlAutorizacao;
        this.state = res.state;
        window.open(res.urlAutorizacao, '_blank');
        setTimeout(() => { if (this.estadoLogin === 'success') this.estadoLogin = 'idle'; }, 4000);
      },
      error: (err) => {
        this.estadoLogin = 'error';
        this.erroLogin = err?.error?.mensagem || err?.error?.erro || 'Falha ao gerar a URL de autorização.';
        setTimeout(() => this.estadoLogin = 'idle', 5000);
      }
    });
  }

  /** POST /api/ml/auth/seed — troca o refresh_token colado por um par novo e salva. */
  enviarSeed(): void {
    const token = this.refreshToken.trim();
    if (!token || this.estadoSeed === 'loading') return;

    this.estadoSeed = 'loading';
    this.seedMensagem = null;
    this.seedDetalhe = null;

    this.api.mlAuthSeed(token).subscribe({
      next: (res) => {
        // O backend responde 200 mesmo no erro de validação, com status: "erro".
        const ok = res.status === 'ok';
        this.estadoSeed = ok ? 'success' : 'error';
        this.seedMensagem = ok ? 'Token salvo! O bot renova sozinho daqui pra frente.'
                               : (res.mensagem || 'O backend recusou o refresh token.');
        if (ok) {
          this.refreshToken = '';
          this.seedDetalhe = `userId ${res.userId} · expira em ${res.expiraEm}`;
        }
        setTimeout(() => this.estadoSeed = 'idle', 6000);
      },
      error: (err) => {
        this.estadoSeed = 'error';
        this.seedMensagem = err?.error?.mensagem || err?.error?.erro || 'Falha ao enviar o refresh token.';
        setTimeout(() => this.estadoSeed = 'idle', 6000);
      }
    });
  }

  copiarUrl(): void {
    if (this.urlAutorizacao) navigator.clipboard?.writeText(this.urlAutorizacao);
  }
}
