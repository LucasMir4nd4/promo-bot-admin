import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  imports: [CommonModule],
  templateUrl: './ml-diagnostico.component.html',
  styleUrls: ['./ml-diagnostico.component.css']
})
export class MlDiagnosticoComponent {

  estado: Estado = 'idle';
  resultado: DiagnosticoMl | null = null;
  erro: string | null = null;

  /** Endpoints com o detalhe da resposta aberto. */
  expandidos = new Set<string>();

  constructor(private readonly api: BotApiService) {}

  executar(): void {
    if (this.estado === 'loading') return;

    this.estado = 'loading';
    this.erro = null;
    this.resultado = null;

    this.api.diagnosticarMl().subscribe({
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
