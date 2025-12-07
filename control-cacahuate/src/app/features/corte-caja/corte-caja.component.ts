import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { CorteCajaService } from '../../core/services/corte-caja.service';
import { NotificationService } from '../../core/services/notification.service';
import { formatearMoneda } from '../../core/utils/calculos.utils';
import { Router } from '@angular/router';

@Component({
  selector: 'app-corte-caja',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './corte-caja.component.html',
  styleUrl: './corte-caja.component.scss',
})
export class CorteCajaComponent implements OnInit {
  private corteService = inject(CorteCajaService);
  private notificationService = inject(NotificationService);
  private fb = inject(FormBuilder);
  private router = inject(Router);

  corteForm: FormGroup;

  // Datos del sistema
  ventasEfectivo = 0;
  abonosEfectivo = 0;
  totalSistema = 0;

  // Calculados
  diferencia = 0;
  cargando = true;
  guardando = false;

  constructor() {
    this.corteForm = this.fb.group({
      dineroReal: [0, [Validators.required, Validators.min(0)]],
      notas: [''],
    });
  }

  async ngOnInit() {
    try {
      const resumen = await this.corteService.obtenerResumenDelDia();
      if (resumen) {
        this.ventasEfectivo = resumen.efectivoVentas;
        this.abonosEfectivo = resumen.efectivoAbonos;
        this.totalSistema = resumen.totalEfectivo;

        // Calcular diferencia inicial (asumiendo 0 real)
        this.calcularDiferencia();
      } else {
        this.notificationService.info('No hay movimientos registrados hoy');
      }
    } catch (error) {
      this.notificationService.error('Error al cargar datos del día');
    } finally {
      this.cargando = false;
    }

    // Escuchar cambios en el dinero real para actualizar diferencia
    this.corteForm.get('dineroReal')?.valueChanges.subscribe(() => {
      this.calcularDiferencia();
    });
  }

  calcularDiferencia() {
    const dineroReal = this.corteForm.get('dineroReal')?.value || 0;
    this.diferencia = dineroReal - this.totalSistema;
  }

  formatear(valor: number): string {
    return formatearMoneda(valor);
  }

  async realizarCorte() {
    if (this.corteForm.invalid) return;

    this.guardando = true;
    const formValues = this.corteForm.value;

    try {
      await this.corteService.guardarCorte({
        ventasEfectivo: this.ventasEfectivo,
        abonosEfectivo: this.abonosEfectivo,
        totalSistema: this.totalSistema,
        dineroReal: formValues.dineroReal,
        diferencia: this.diferencia,
        notas: formValues.notas,
      });

      this.notificationService.success('Corte de caja guardado correctamente');
      this.router.navigate(['/dashboard']); // Regresar al dashboard
    } catch (error) {
      this.notificationService.error('Error al guardar el corte');
    } finally {
      this.guardando = false;
    }
  }

  cancelar() {
    this.router.navigate(['/dashboard']);
  }
}
