import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HealthCardComponent } from '../../components/health-card/health-card.component';
import { ExecutarBtnComponent } from '../../components/executar-btn/executar-btn.component';
import { BuscarCategoriasBtnComponent } from '../../components/buscar-categorias-btn/buscar-categorias-btn.component';
import { AliexpressBtnComponent } from '../../components/aliexpress-btn/aliexpress-btn.component';
import { ProdutosTableComponent } from '../../components/produtos-table/produtos-table.component';
import { ConfigModalComponent } from '../../components/config-modal/config-modal.component';
import { BotApiService } from '../../services/bot-api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    HealthCardComponent,
    ExecutarBtnComponent,
    BuscarCategoriasBtnComponent,
    AliexpressBtnComponent,
    ProdutosTableComponent,
    ConfigModalComponent
  ],
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.css']
})
export class DashboardPage {

  configAberto = signal(false);
  agora = new Date();

  constructor(readonly api: BotApiService) {
    // Atualiza o timestamp do header a cada minuto
    setInterval(() => this.agora = new Date(), 60000);
  }

  abrirConfig(): void { this.configAberto.set(true); }
  fecharConfig(): void { this.configAberto.set(false); }
}
