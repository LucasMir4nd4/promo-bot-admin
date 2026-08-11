import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BotApiService,
  WhatsAppConexao,
  WhatsAppGrupo,
  WhatsAppInstancia
} from '../../services/bot-api.service';

type EstadoConexao = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-whatsapp-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './whatsapp-card.component.html',
  styleUrls: ['./whatsapp-card.component.css']
})
export class WhatsappCardComponent implements OnInit, OnDestroy {

  instancia = '';
  reiniciar = false;

  estado: EstadoConexao = 'idle';
  conexao: WhatsAppConexao | null = null;
  mensagem: string | null = null;

  /** Estado da conexão vindo do poll: open | close | connecting | inexistente. */
  estadoAtual: string | null = null;
  conectada = false;

  /** Fonte da imagem do QR: o data URI da resposta ou o PNG servido pelo backend. */
  qrSrc: string | null = null;
  qrIndisponivel = false;
  /** Muda a cada QR novo para furar o cache do navegador no link do PNG. */
  private qrCacheBust = Date.now();

  instancias: WhatsAppInstancia[] = [];
  instanciasCarregando = false;
  instanciasErro: string | null = null;

  grupos: WhatsAppGrupo[] = [];
  gruposCarregando = false;
  gruposErro: string | null = null;
  jidCopiado: string | null = null;

  destino = '';
  texto = 'Teste do PromoBot ✅';
  envioEstado: EstadoConexao = 'idle';
  envioMensagem: string | null = null;

  logs: string[] = [];

  private pollId: any = null;

  constructor(private readonly api: BotApiService) {}

  ngOnInit(): void {
    this.api.whatsappConfig().subscribe({
      next: (cfg) => {
        this.instancia = cfg.instanciaPadrao ?? '';
        this.reiniciar = cfg.reiniciarPadrao ?? false;
        this.addLog(`Instância padrão: ${this.instancia}`);
        if (this.instancia) this.consultarStatus(true);
      },
      error: () => this.addLog('✗ Não foi possível ler /api/whatsapp/config')
    });
  }

  ngOnDestroy(): void {
    this.pararPoll();
  }

  get instanciaAtual(): string {
    return (this.conexao?.instancia || this.instancia || '').trim();
  }

  /** Link para abrir o QR Code em PNG numa aba nova. */
  get qrPngHref(): string {
    return this.api.qrCodeUrl(this.instanciaAtual, this.qrCacheBust);
  }

  /** POST /api/whatsapp/instancias/conectar — cria (ou reaproveita) e traz o QR Code. */
  conectar(): void {
    if (this.estado === 'loading') return;

    this.estado = 'loading';
    this.mensagem = null;
    this.qrIndisponivel = false;
    this.addLog(`Conectando '${this.instancia || 'padrão'}' (reiniciar=${this.reiniciar})...`);

    this.api.conectarWhatsapp(this.instancia, this.reiniciar).subscribe({
      next: (res) => {
        this.estado = 'success';
        this.conexao = res;
        this.instancia = res.instancia;
        this.estadoAtual = res.estado;
        this.conectada = res.estado === 'open';
        this.aplicarQr(res);
        this.addLog(`✓ Estado: ${res.estado}${res.criada ? ' (instância criada)' : ''}`);
        if (res.pairingCode) this.addLog(`✓ Código de pareamento: ${res.pairingCode}`);
        if (!this.conectada) this.iniciarPoll();
        setTimeout(() => { if (this.estado === 'success') this.estado = 'idle'; }, 4000);
      },
      error: (err) => {
        this.estado = 'error';
        this.mensagem = this.textoErro(err, 'Falha ao conectar. Verifique se a Evolution API está de pé.');
        this.addLog(`✗ ${this.mensagem}`);
        setTimeout(() => this.estado = 'idle', 5000);
      }
    });
  }

  /** O QR da Evolution expira em segundos — este botão pede um novo sem matar a instância. */
  novoQrCode(): void {
    if (this.estado === 'loading' || !this.instanciaAtual) return;

    this.estado = 'loading';
    this.qrIndisponivel = false;
    this.addLog('Gerando novo QR Code...');

    this.api.conectarWhatsapp(this.instanciaAtual, false).subscribe({
      next: (res) => {
        this.estado = 'idle';
        this.conexao = res;
        this.estadoAtual = res.estado;
        this.conectada = res.estado === 'open';
        this.aplicarQr(res);
        this.addLog(this.conectada ? '✓ Já conectada, QR não é necessário' : '✓ QR Code atualizado');
      },
      error: (err) => {
        this.estado = 'error';
        this.mensagem = this.textoErro(err, 'Falha ao atualizar o QR Code.');
        this.addLog(`✗ ${this.mensagem}`);
        setTimeout(() => this.estado = 'idle', 5000);
      }
    });
  }

  /** GET /api/whatsapp/instancias/{instancia}/status */
  consultarStatus(silencioso = false): void {
    const nome = this.instanciaAtual;
    if (!nome) return;

    this.api.statusWhatsapp(nome).subscribe({
      next: (res) => {
        this.estadoAtual = res.estado;
        this.conectada = res.conectada;
        if (!silencioso) this.addLog(`Status: ${res.estado}`);
        if (res.conectada) {
          this.pararPoll();
          this.qrSrc = null;
          this.addLog('✓ WhatsApp conectado!');
        }
      },
      error: (err) => {
        if (!silencioso) this.addLog(`✗ ${this.textoErro(err, 'Falha ao consultar status.')}`);
      }
    });
  }

  /** GET /api/whatsapp/instancias — tudo que está cadastrado na Evolution API. */
  carregarInstancias(): void {
    if (this.instanciasCarregando) return;

    this.instanciasCarregando = true;
    this.instanciasErro = null;

    this.api.listarInstancias().subscribe({
      next: (res) => {
        this.instancias = res ?? [];
        this.instanciasCarregando = false;
        this.addLog(`✓ ${this.instancias.length} instância(s) na Evolution`);
      },
      error: (err) => {
        this.instanciasCarregando = false;
        this.instanciasErro = this.textoErro(err, 'Falha ao listar instâncias.');
        this.addLog(`✗ ${this.instanciasErro}`);
      }
    });
  }

  /** A Evolution muda o formato entre versões: ora aninha em "instance", ora vem plano. */
  nomeInstancia(inst: WhatsAppInstancia): string {
    const interno = inst?.['instance'] ?? inst;
    return interno?.['instanceName'] ?? interno?.['name'] ?? '(sem nome)';
  }

  estadoInstancia(inst: WhatsAppInstancia): string {
    const interno = inst?.['instance'] ?? inst;
    return interno?.['state'] ?? interno?.['status'] ?? interno?.['connectionStatus'] ?? '—';
  }

  usarInstancia(inst: WhatsAppInstancia): void {
    const nome = this.nomeInstancia(inst);
    if (nome === '(sem nome)') return;
    this.instancia = nome;
    this.conexao = null;
    this.qrSrc = null;
    this.grupos = [];
    this.consultarStatus();
  }

  /** GET /api/whatsapp/instancias/{instancia}/grupos */
  carregarGrupos(): void {
    const nome = this.instanciaAtual;
    if (!nome || this.gruposCarregando) return;

    this.gruposCarregando = true;
    this.gruposErro = null;

    this.api.listarGrupos(nome).subscribe({
      next: (res) => {
        this.grupos = res ?? [];
        this.gruposCarregando = false;
        this.addLog(`✓ ${this.grupos.length} grupo(s) encontrado(s)`);
      },
      error: (err) => {
        this.gruposCarregando = false;
        this.gruposErro = this.textoErro(err, 'Falha ao listar grupos. A instância precisa estar conectada.');
        this.addLog(`✗ ${this.gruposErro}`);
      }
    });
  }

  copiarJid(jid?: string): void {
    if (!jid) return;
    navigator.clipboard?.writeText(jid).then(() => {
      this.jidCopiado = jid;
      setTimeout(() => { if (this.jidCopiado === jid) this.jidCopiado = null; }, 2000);
    });
  }

  usarComoDestino(jid?: string): void {
    if (!jid) return;
    this.destino = jid;
  }

  /** POST /api/whatsapp/instancias/{instancia}/mensagem */
  enviarTeste(): void {
    const nome = this.instanciaAtual;
    if (!nome || this.envioEstado === 'loading') return;
    if (!this.destino.trim() || !this.texto.trim()) return;

    this.envioEstado = 'loading';
    this.envioMensagem = null;

    this.api.enviarMensagem(nome, this.destino.trim(), this.texto.trim()).subscribe({
      next: () => {
        this.envioEstado = 'success';
        this.envioMensagem = 'Mensagem enviada!';
        this.addLog(`✓ Mensagem enviada para ${this.destino.trim()}`);
        setTimeout(() => { this.envioEstado = 'idle'; this.envioMensagem = null; }, 5000);
      },
      error: (err) => {
        this.envioEstado = 'error';
        this.envioMensagem = this.textoErro(err, 'Falha ao enviar a mensagem.');
        this.addLog(`✗ ${this.envioMensagem}`);
        setTimeout(() => { this.envioEstado = 'idle'; this.envioMensagem = null; }, 6000);
      }
    });
  }

  /** DELETE /api/whatsapp/instancias/{instancia} */
  deletarInstancia(): void {
    const nome = this.instanciaAtual;
    if (!nome) return;
    if (!confirm(`Desconectar e remover a instância '${nome}'?`)) return;

    this.pararPoll();
    this.api.deletarInstancia(nome).subscribe({
      next: (res) => {
        this.conexao = null;
        this.qrSrc = null;
        this.grupos = [];
        this.estadoAtual = 'inexistente';
        this.conectada = false;
        this.addLog(`✓ ${res.mensagem}`);
      },
      error: (err) => this.addLog(`✗ ${this.textoErro(err, 'Falha ao remover a instância.')}`)
    });
  }

  /** O <img> falha quando o backend responde 204 (sem QR = já conectada). */
  onQrErro(): void {
    this.qrSrc = null;
    this.qrIndisponivel = true;
    this.consultarStatus(true);
  }

  labelEstado(): string {
    switch (this.estadoAtual) {
      case 'open':        return 'Conectada';
      case 'connecting':  return 'Conectando';
      case 'close':       return 'Desconectada';
      case 'inexistente': return 'Inexistente';
      case null:          return 'Desconhecido';
      default:            return this.estadoAtual!;
    }
  }

  classeEstado(): string {
    if (this.estadoAtual === 'open') return 'on';
    if (this.estadoAtual === 'connecting') return 'warn';
    return 'off';
  }

  limparLogs(): void {
    this.logs = [];
  }

  trackByJid(_: number, grupo: WhatsAppGrupo): any {
    return grupo['id'];
  }

  // ─── Interno ───────────────────────────────────────────────────────────────

  /** Prefere o data URI da resposta; sem ele cai no PNG servido pelo backend. */
  private aplicarQr(res: WhatsAppConexao): void {
    this.qrCacheBust = Date.now();
    if (res.qrcode) {
      this.qrSrc = res.qrcode;
      this.qrIndisponivel = false;
    } else if (res.estado !== 'open') {
      this.qrSrc = this.api.qrCodeUrl(res.instancia, this.qrCacheBust);
      this.qrIndisponivel = false;
    } else {
      this.qrSrc = null;
      this.qrIndisponivel = false;
    }
  }

  /** Poll de status enquanto o QR está na tela, até a leitura no celular concluir. */
  private iniciarPoll(): void {
    this.pararPoll();
    const id = setInterval(() => this.consultarStatus(true), 3000);
    this.pollId = id;
    // Rede de segurança: sem leitura em 2 min este poll para sozinho — só ele,
    // para não derrubar um poll iniciado por uma conexão mais nova.
    setTimeout(() => { if (this.pollId === id) this.pararPoll(); }, 120000);
  }

  private pararPoll(): void {
    if (this.pollId !== null) {
      clearInterval(this.pollId);
      this.pollId = null;
    }
  }

  private textoErro(err: any, padrao: string): string {
    return err?.error?.erro || err?.error?.detalhe || err?.error?.message || padrao;
  }

  private addLog(msg: string): void {
    const ts = new Date().toLocaleTimeString('pt-BR');
    this.logs.unshift(`[${ts}] ${msg}`);
    if (this.logs.length > 10) this.logs = this.logs.slice(0, 10);
  }
}
