import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { interval, Subscription, startWith, switchMap } from 'rxjs';
import { BotApiService, WorkerEstado } from '../../services/bot-api.service';

/**
 * Liga e desliga o worker de automação — o processo Python que abre cada produto
 * no Chrome de afiliado, gera o link e devolve para o bot publicar.
 *
 * O que este card NÃO faz, de propósito: iniciar ou matar o processo. Ele só
 * existe depois que o Chrome está aberto pelo chrome-afiliado.bat e logado como
 * afiliado — subir o Python sem isso produz um processo que morre no CDP. Quem
 * inicia é o operador; o painel manda trabalhar ou parar, e mostra se está no ar.
 *
 * Por isso duas informações separadas: ONLINE (o processo está de pé) e a chave
 * (ele tem autorização para publicar). "Pausei" e "esqueci de iniciar o Python"
 * são os dois enganos comuns aqui, e sem essa separação os dois dariam a mesma
 * tela.
 */
@Component({
  selector: 'app-worker-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './worker-card.component.html',
  styleUrls: ['./worker-card.component.css']
})
export class WorkerCardComponent implements OnInit, OnDestroy {

  estado: WorkerEstado | null = null;
  carregando = true;
  alternando = false;
  erro: string | null = null;
  /** Confirmação do POST, some sozinha — o estado em si já fica no card. */
  aviso: string | null = null;

  private sub?: Subscription;
  private avisoTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly api: BotApiService) {}

  ngOnInit(): void {
    // 10s: o worker manda sinal a cada 30s e é dado por offline com 95s de
    // silêncio. Um poll mais lento faria a queda demorar mais para aparecer do
    // que o próprio backend leva para detectá-la.
    this.sub = interval(10000).pipe(
      startWith(0),
      switchMap(() => this.api.estadoWorker())
    ).subscribe({
      next: (e) => {
        this.estado = e;
        this.carregando = false;
        this.erro = null;
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e?.status === 404 || e?.status === 405
          ? 'Esta versão do backend não tem o controle do worker (GET /api/worker). Recompile e reinicie o bot.'
          : 'Não consegui falar com o bot. Verifique se ele está online na URL configurada.';
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    clearTimeout(this.avisoTimer);
  }

  alternar(): void {
    if (!this.estado || this.alternando) return;

    const alvo = !this.estado.ativo;
    this.alternando = true;
    this.aviso = null;

    this.api.definirWorkerAtivo(alvo).subscribe({
      next: (res) => {
        this.alternando = false;
        // A resposta já traz o estado inteiro: adiantar a tela em vez de
        // esperar o próximo poll evita o botão parecer que não respondeu.
        this.estado = res;
        this.aviso = res.mensagem;
        clearTimeout(this.avisoTimer);
        this.avisoTimer = setTimeout(() => { this.aviso = null; }, 8000);
      },
      error: () => {
        this.alternando = false;
        this.erro = 'Não consegui mudar a chave. O bot respondeu com erro.';
      }
    });
  }

  get situacao(): string {
    if (this.erro) return 'SEM RESPOSTA';
    if (!this.estado) return 'VERIFICANDO';
    return this.estado.situacao;
  }

  get classeSituacao(): string {
    if (this.erro || !this.estado) return 'st-desconhecido';
    switch (this.estado.situacao) {
      case 'PUBLICANDO': return 'st-publicando';
      case 'PAUSADO': return 'st-pausado';
      default: return 'st-offline';
    }
  }

  /** "há 12s" / "há 4min" — quanto tempo faz que o Python deu sinal. */
  get ultimoSinal(): string {
    const s = this.estado?.segundosDesdeUltimoSinal;
    if (s == null) return 'nunca';
    if (s < 60) return `há ${s}s`;
    const min = Math.floor(s / 60);
    return min < 60 ? `há ${min}min` : `há ${Math.floor(min / 60)}h`;
  }

  get rotuloBotao(): string {
    if (this.alternando) return 'MUDANDO...';
    return this.estado?.ativo ? '■ DESLIGAR' : '▶ LIGAR';
  }
}
