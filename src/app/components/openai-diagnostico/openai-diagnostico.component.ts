import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BotApiService, DiagnosticoOpenAi, TesteOpenAi } from '../../services/bot-api.service';

type Estado = 'idle' | 'loading' | 'success' | 'error';

/**
 * Testa a integração com a OpenAI pelo mesmo caminho que a publicação usa.
 *
 * Existe porque essa falha é invisível: o OpenAiClient engole qualquer erro e
 * publica com um texto genérico ("🔥 OFERTA IMPERDÍVEL!" + o título cru). A
 * promoção sai normalmente no Telegram e no WhatsApp, então a integração pode
 * estar morta há semanas sem nenhum sintoma — e ninguém abre o log de um bot que
 * está publicando.
 *
 * O botão gasta alguns tokens de verdade (o teste 'copy' faz uma chamada real).
 * É o preço de provar que o caminho funciona, e por isso está avisado na tela.
 */
@Component({
  selector: 'app-openai-diagnostico',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './openai-diagnostico.component.html',
  styleUrls: ['./openai-diagnostico.component.css']
})
export class OpenaiDiagnosticoComponent {

  estado: Estado = 'idle';
  resultado: DiagnosticoOpenAi | null = null;
  erro: string | null = null;

  expandidos = new Set<string>();

  constructor(private readonly api: BotApiService) {}

  executar(): void {
    if (this.estado === 'loading') return;

    this.estado = 'loading';
    this.erro = null;
    this.resultado = null;

    this.api.diagnosticarOpenAi().subscribe({
      next: (res) => {
        this.estado = 'success';
        this.resultado = res;
      },
      error: (e) => {
        this.estado = 'error';
        this.erro = e?.status === 404 || e?.status === 405
          ? 'Esta versão do backend não tem o diagnóstico da OpenAI (GET /api/openai/diagnostico).'
          : 'Não consegui falar com o bot. Verifique se ele está online.';
      }
    });
  }

  alternarDetalhe(nome: string): void {
    if (this.expandidos.has(nome)) this.expandidos.delete(nome);
    else this.expandidos.add(nome);
  }

  estaExpandido(nome: string): boolean {
    return this.expandidos.has(nome);
  }

  get testes(): TesteOpenAi[] {
    return this.resultado?.testes ?? [];
  }

  get falhas(): number {
    return this.testes.filter(t => !t.ok).length;
  }

  /**
   * Com o perfil 'mock' ativo, o MockOpenAiClient é @Primary e a OpenAI não é
   * chamada em publicação nenhuma. Sem esse aviso, um "tudo verde" aqui diria o
   * contrário do que acontece na hora de publicar.
   */
  get emModoMock(): boolean {
    return this.resultado?.configuracao?.perfisAtivos?.includes('mock') ?? false;
  }

  /** Sem chave nem adianta ler o resto: nenhum teste chega a rodar. */
  get semChave(): boolean {
    return this.resultado != null && !this.resultado.configuracao?.chaveConfigurada;
  }

  trackByNome(_: number, t: TesteOpenAi): string {
    return t.nome;
  }
}
