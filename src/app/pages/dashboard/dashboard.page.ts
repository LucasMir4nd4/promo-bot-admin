import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HealthCardComponent } from '../../components/health-card/health-card.component';
import { FiltrosCapturaComponent } from '../../components/filtros-captura/filtros-captura.component';
import { AliexpressBtnComponent } from '../../components/aliexpress-btn/aliexpress-btn.component';
import { MercadoLivreBtnComponent } from '../../components/mercadolivre-btn/mercadolivre-btn.component';
import { ProdutosTableComponent } from '../../components/produtos-table/produtos-table.component';
import { ConfigModalComponent } from '../../components/config-modal/config-modal.component';
import { LinksFixosComponent } from '../../components/links-fixos/links-fixos.component';
import { WhatsappCardComponent } from '../../components/whatsapp-card/whatsapp-card.component';
import { MlAuthCardComponent } from '../../components/ml-auth-card/ml-auth-card.component';
import { MlDiagnosticoComponent } from '../../components/ml-diagnostico/ml-diagnostico.component';
import { OpenaiDiagnosticoComponent } from '../../components/openai-diagnostico/openai-diagnostico.component';
import { WorkerCardComponent } from '../../components/worker-card/worker-card.component';
import { BotApiService } from '../../services/bot-api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    HealthCardComponent,
    FiltrosCapturaComponent,
    AliexpressBtnComponent,
    MercadoLivreBtnComponent,
    ProdutosTableComponent,
    LinksFixosComponent,
    WhatsappCardComponent,
    MlAuthCardComponent,
    MlDiagnosticoComponent,
    OpenaiDiagnosticoComponent,
    WorkerCardComponent,
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
