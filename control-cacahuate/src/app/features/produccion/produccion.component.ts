import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SaboresService } from '../../core/services/sabores.service';
import { InventarioService } from '../../core/services/inventario.service';
import { Sabor, LoteProduccion } from '../../core/models/interfaces';
import {
  formatearMoneda,
  calcularCostoUnitarioLote,
  calcularMargenPorcentaje,
} from '../../core/utils/calculos.utils';
import { ConfiguracionService } from '../../core/services/configuracion.service';
import { Observable, combineLatest, map } from 'rxjs';

interface SaborConInventario extends Sabor {
  cantidad: number;
  costoPromedio: number;
}

@Component({
  selector: 'app-produccion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './produccion.component.html',
  styleUrl: './produccion.component.scss',
})
export class ProduccionComponent implements OnInit {
  private saboresService = inject(SaboresService);
  private inventarioService = inject(InventarioService);
  private configuracionService = inject(ConfiguracionService);

  saboresConInventario$!: Observable<SaborConInventario[]>;
  lotes$!: Observable<LoteProduccion[]>;
  sabores$!: Observable<Sabor[]>;

  precioVenta = 10;

  // Modal nuevo lote
  modalVisible = false;
  nuevoLote = {
    saborId: '',
    costoKilo: null as number | null,
    bolsasResultantes: null as number | null,
    notas: '',
  };

  // Cálculos en tiempo real
  costoUnitarioCalculado = 0;
  utilidadPorBolsa = 0;
  margenPorcentaje = 0;

  // Estado
  guardando = false;
  mensaje = '';
  mensajeError = false;

  ngOnInit() {
    this.sabores$ = this.saboresService.getSabores$();
    this.lotes$ = this.inventarioService.getLotes$();

    // Combinamos sabores con su inventario correspondiente para la vista
    this.saboresConInventario$ = combineLatest([
      this.saboresService.getSabores$(),
      this.inventarioService.getInventario$(),
    ]).pipe(
      map(([sabores, inventarios]) => {
        return sabores.map((sabor) => {
          const inv = inventarios.find((i) => i.saborId === sabor.id);
          return {
            ...sabor,
            cantidad: inv?.cantidad || 0,
            costoPromedio: inv?.costoPromedioPonderado || 0,
          };
        });
      })
    );

    this.configuracionService.config$.subscribe((config) => {
      if (config) {
        this.precioVenta = config.precioVentaDefault;
      }
    });
  }

  formatearMoneda(valor: number): string {
    return formatearMoneda(valor);
  }

  abrirModal() {
    this.nuevoLote = {
      saborId: '',
      costoKilo: null,
      bolsasResultantes: null,
      notas: '',
    };
    this.resetCalculos();
    this.modalVisible = true;
  }

  cerrarModal() {
    this.modalVisible = false;
  }

  resetCalculos() {
    this.costoUnitarioCalculado = 0;
    this.utilidadPorBolsa = 0;
    this.margenPorcentaje = 0;
  }

  /**
   * Calcula métricas en vivo mientras el usuario escribe
   */
  calcularCostos() {
    if (
      this.nuevoLote.costoKilo &&
      this.nuevoLote.bolsasResultantes &&
      this.nuevoLote.bolsasResultantes > 0
    ) {
      this.costoUnitarioCalculado = calcularCostoUnitarioLote(
        this.nuevoLote.costoKilo,
        this.nuevoLote.bolsasResultantes
      );
      this.utilidadPorBolsa = this.precioVenta - this.costoUnitarioCalculado;
      this.margenPorcentaje = calcularMargenPorcentaje(
        this.costoUnitarioCalculado,
        this.precioVenta
      );
    } else {
      this.resetCalculos();
    }
  }

  async guardarLote() {
    if (
      !this.nuevoLote.saborId ||
      !this.nuevoLote.costoKilo ||
      !this.nuevoLote.bolsasResultantes
    ) {
      this.mostrarMensaje('Completa todos los campos obligatorios', true);
      return;
    }

    if (this.nuevoLote.bolsasResultantes <= 0) {
      this.mostrarMensaje('Las bolsas deben ser mayor a 0', true);
      return;
    }

    this.guardando = true;

    try {
      await this.inventarioService.registrarLote({
        saborId: this.nuevoLote.saborId,
        costoKilo: this.nuevoLote.costoKilo,
        bolsasResultantes: this.nuevoLote.bolsasResultantes,
        notas: this.nuevoLote.notas || undefined,
      });

      this.mostrarMensaje(
        `✅ Lote registrado: +${this.nuevoLote.bolsasResultantes} bolsas`
      );
      this.cerrarModal();
    } catch (error) {
      console.error(error);
      this.mostrarMensaje('Error al guardar el lote', true);
    }

    this.guardando = false;
  }

  // Helpers para la vista
  getSaborNombre(saborId: string, sabores: Sabor[]): string {
    return sabores.find((s) => s.id === saborId)?.nombre || 'Desconocido';
  }

  getSaborEmoji(saborId: string, sabores: Sabor[]): string {
    return sabores.find((s) => s.id === saborId)?.emoji || '🥜';
  }

  getSaborColor(saborId: string, sabores: Sabor[]): string {
    return sabores.find((s) => s.id === saborId)?.color || '#888';
  }

  private mostrarMensaje(texto: string, esError = false) {
    this.mensaje = texto;
    this.mensajeError = esError;
    setTimeout(() => {
      this.mensaje = '';
      this.mensajeError = false;
    }, 3000);
  }
}
