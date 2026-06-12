import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BotApiService, HealthResponse } from '../../services/bot-api.service';
import { interval, Subscription, startWith, switchMap } from 'rxjs';

@Component({
  selector: 'app-health-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './health-card.component.html',
  styleUrls: ['./health-card.component.css']
})
export class HealthCardComponent implements OnInit, OnDestroy {

  health: HealthResponse | null = null;
  loading = true;
  erro = false;
  ultimaAtualizacao: Date | null = null;

  private sub?: Subscription;

  constructor(private api: BotApiService) {}

  ngOnInit(): void {
    // Atualiza automaticamente a cada 30 segundos
    this.sub = interval(30000).pipe(
      startWith(0),
      switchMap(() => this.api.getHealth())
    ).subscribe({
      next: (data) => {
        this.health = data;
        this.loading = false;
        this.erro = false;
        this.ultimaAtualizacao = new Date();
      },
      error: () => {
        this.loading = false;
        this.erro = true;
        this.ultimaAtualizacao = new Date();
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get statusLabel(): string {
    if (this.erro) return 'OFFLINE';
    if (!this.health) return 'VERIFICANDO';
    const s = this.health.status?.toLowerCase();
    if (s === 'up' || s === 'ok' || s === 'running') return 'ONLINE';
    return this.health.status?.toUpperCase() || 'DESCONHECIDO';
  }

  get statusClass(): string {
    if (this.erro) return 'status-offline';
    if (this.loading) return 'status-loading';
    const s = this.health?.status?.toLowerCase();
    if (s === 'up' || s === 'ok' || s === 'running') return 'status-online';
    return 'status-warn';
  }

  atualizar(): void {
    this.loading = true;
    this.api.getHealth().subscribe({
      next: (data) => {
        this.health = data;
        this.loading = false;
        this.erro = false;
        this.ultimaAtualizacao = new Date();
      },
      error: () => {
        this.loading = false;
        this.erro = true;
        this.ultimaAtualizacao = new Date();
      }
    });
  }
}
