import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CorteCajaService } from '../../core/services/corte-caja.service';
import { VentasService } from '../../core/services/ventas.service';
import { NotificationService } from '../../core/services/notification.service';
import { CajaDiaria } from '../../core/models/interfaces';
import { formatearMoneda } from '../../core/utils/calculos.utils';

@Component({
  selector: 'app-corte-caja',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './corte-caja.component.html',
  styleUrl: './corte-caja.component.scss',
})
export class CorteCajaComponent implements OnInit {
  private corteService = inject(CorteCajaService);
  private ventasService = inject(VentasService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  // Datos
  cajaHoy: CajaDiaria | null = null;
  fechaHoy = new Date();

  // Inputs Usuario
  efectivoContado: number | null = null;
  montoRetiro: number | null = null;
  notas: string = '';

  // Cálculos
  diferencia = 0;
  fondoFinal = 0;

  // Estado
  cargando = true;
  guardando = false;
  corteYaRealizado = false;

  async ngOnInit() {
    this.cargando = true;
    try {
      this.cajaHoy = await this.ventasService.getCajaDiaHoy();

      if (this.cajaHoy?.corteRealizado) {
        this.corteYaRealizado = true;
        if (this.cajaHoy.datosCorte) {
          this.efectivoContado = this.cajaHoy.datosCorte.contadoEnCaja;
          this.montoRetiro = this.cajaHoy.datosCorte.montoRetirado;
          this.diferencia = this.cajaHoy.datosCorte.diferencia;
          this.fondoFinal = this.cajaHoy.datosCorte.fondoCajaManana;
          this.notas = this.cajaHoy.datosCorte.notas || '';
        }
      }
    } catch (error) {
      console.error(error);
      this.notificationService.error('Error al cargar información de caja');
    } finally {
      this.cargando = false;
    }
  }

  formatearMoneda(val: number) {
    return formatearMoneda(val);
  }

  calcularDiferencia() {
    const esperado = this.cajaHoy?.totalEfectivo || 0;
    const contado = this.efectivoContado || 0;
    this.diferencia = contado - esperado;
    this.calcularFondo();
  }

  calcularFondo() {
    const contado = this.efectivoContado || 0;
    const retiro = this.montoRetiro || 0;
    this.fondoFinal = contado - retiro;
  }

  // --- ACCIONES RÁPIDAS ---

  igualarAlSistema() {
    if (!this.corteYaRealizado) {
      this.efectivoContado = this.cajaHoy?.totalEfectivo || 0;
      this.calcularDiferencia();
    }
  }

  retirarTodo() {
    if (this.efectivoContado !== null && !this.corteYaRealizado) {
      this.montoRetiro = this.efectivoContado;
      this.calcularFondo();
    }
  }

  // NUEVO: Calcula el retiro basado en cuánto quieres dejar de fondo
  dejarFondo(montoObjetivo: number) {
    if (this.efectivoContado === null) return;

    // Si tengo 1000 y quiero dejar 200, retiro 800.
    let retiro = this.efectivoContado - montoObjetivo;

    // Seguridad: no retirar negativo (si tienes 100 y quieres dejar 200, retiras 0)
    if (retiro < 0) retiro = 0;

    this.montoRetiro = retiro;
    this.calcularFondo();
  }

  async confirmarCorte() {
    if (this.efectivoContado === null || this.efectivoContado < 0) {
      this.notificationService.error('Ingresa cuánto dinero hay en caja');
      return;
    }

    const retiro = this.montoRetiro || 0;
    if (retiro < 0) {
      this.notificationService.error('El retiro no puede ser negativo');
      return;
    }

    if (this.fondoFinal < 0) {
      this.notificationService.error('Estás retirando más dinero del que hay');
      return;
    }

    const confirmar = confirm(`
      ¿Cerrar caja del día?
      
      Contado: ${this.formatearMoneda(this.efectivoContado)}
      Retiro: ${this.formatearMoneda(retiro)}
      Fondo Mañana: ${this.formatearMoneda(this.fondoFinal)}
      
      Esta acción es irreversible.
    `);

    if (!confirmar) return;

    this.guardando = true;
    try {
      await this.corteService.realizarCorte({
        esperado: this.cajaHoy?.totalEfectivo || 0,
        contado: this.efectivoContado,
        retirado: retiro,
        notas: this.notas,
      });

      this.notificationService.success('¡Corte de caja realizado con éxito!');
      this.corteYaRealizado = true;

      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 2500);
    } catch (error) {
      console.error(error);
      this.notificationService.error('Error al guardar el corte');
    } finally {
      this.guardando = false;
    }
  }
}
