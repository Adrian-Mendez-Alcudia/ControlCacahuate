import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SaboresService } from '../../core/services/sabores.service';
import { InventarioService } from '../../core/services/inventario.service';
import {
  Sabor,
  Inventario,
  LoteProduccion,
} from '../../core/models/interfaces';
import {
  formatearMoneda,
  calcularCostoUnitarioLote,
  calcularMargenPorcentaje,
} from '../../core/utils/calculos.utils';
import { ConfiguracionService } from '../../core/services/configuracion.service';
import { Observable, combineLatest, map } from 'rxjs';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component'; // <--- Importar
import { skeletonClasses } from '@mui/material';

interface SaborConInventario extends Sabor {
  cantidad: number;
  costoPromedio: number;
}

@Component({
  selector: 'app-produccion',
  standalone: true,
  imports: [CommonModule, FormsModule, SkeletonComponent],
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

  ngOnInit() {
    this.sabores$ = this.saboresService.getSabores$();
    this.lotes$ = this.inventarioService.getLotes$();

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
    this.costoUnitarioCalculado = 0;
    this.utilidadPorBolsa = 0;
    this.margenPorcentaje = 0;
    this.modalVisible = true;
  }

  cerrarModal() {
    this.modalVisible = false;
  }

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
      this.costoUnitarioCalculado = 0;
      this.utilidadPorBolsa = 0;
      this.margenPorcentaje = 0;
    }
  }

  async guardarLote() {
    if (
      !this.nuevoLote.saborId ||
      !this.nuevoLote.costoKilo ||
      !this.nuevoLote.bolsasResultantes
    ) {
      this.mostrarMensaje('Completa todos los campos', true);
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
        `¡Lote registrado! +${this.nuevoLote.bolsasResultantes} bolsas`
      );
      this.cerrarModal();
    } catch (error) {
      this.mostrarMensaje('Error al guardar', true);
    }

    this.guardando = false;
  }

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
    setTimeout(() => (this.mensaje = ''), 3000);
  }
}
