import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BotApiService, DiagnosticoMl, TesteDiagnostico } from '../../services/bot-api.service';

type Estado = 'idle' | 'loading' | 'success' | 'error';

/**
 * Sonda cada endpoint do Mercado Livre que o bot usa e mostra o que respondeu.
 *
 * Existe porque "o bot não captura nada" tem três causas muito diferentes e
 * indistinguíveis pelo sintoma: token vencido, aplicação barrada por política do
 * ML (403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES nos endpoints de catálogo), ou
 * categoria sem produto em destaque. Este card separa as três em um clique.
 */
@Component({
  selector: 'app-ml-diagnostico',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ml-diagnostico.component.html',
  styleUrls: ['./ml-diagnostico.component.css']
})
export class MlDiagnosticoComponent {

  estado: Estado = 'idle';
  resultado: DiagnosticoMl | null = null;
  erro: string | null = null;

  /**
   * Anúncio a investigar (MLB…), opcional. Vazio, o backend sonda o primeiro
   * dos destaques — a mesma fonte da captura automática. Preenchido, o teste
   * 'item' aponta para o anúncio da promoção que saiu sem foto e sem preço,
   * que é como se descobre se o problema é daquele anúncio ou da integração.
   */
  item = '';

  /** Endpoints com o detalhe da resposta aberto. */
  expandidos = new Set<string>();

  constructor(private readonly api: BotApiService) {}

  executar(): void {
    if (this.estado === 'loading') return;

    this.estado = 'loading';
    this.erro = null;
    this.resultado = null;

    this.api.diagnosticarMl(this.item).subscribe({
      next: (res) => {
        this.estado = 'success';
        this.resultado = res;
      },
      error: (e) => {
        this.estado = 'error';
        this.erro = e?.status === 404
          ? 'Esta versão do backend não tem o diagnóstico (GET /api/mercadolivre/diagnostico).'
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

  get testes(): TesteDiagnostico[] {
    return this.resultado?.testes ?? [];
  }

  get falhas(): number {
    return this.testes.filter(t => !t.ok).length;
  }

  /**
   * O teste de GET /items/{id}, quando o backend o inclui.
   *
   * Merece tratamento próprio: é o único teste cuja falha explica uma promoção
   * publicada "pelada" — sem foto e sem preço — e esse sintoma não aponta para
   * o ML de forma nenhuma (no log ele aparece como "Novo produto: null").
   */
  get testeItem(): TesteDiagnostico | null {
    return this.testes.find(t => t.nome === 'item') ?? null;
  }

  get itemFalhou(): boolean {
    const t = this.testeItem;
    return t != null && !t.ok;
  }

  /**
   * O bloqueio por política é o achado mais importante: significa que nem token
   * novo nem conta de vendedor resolvem, então merece destaque próprio.
   */
  get bloqueadoPorPolitica(): boolean {
    return this.testes.some(t => (t.resposta ?? '').includes('PA_UNAUTHORIZED_RESULT_FROM_POLICIES'));
  }

  trackByNome(_: number, t: TesteDiagnostico): string {
    return t.nome;
  }
}
