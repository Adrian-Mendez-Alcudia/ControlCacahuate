import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router'; // Importante para el routerLink
import { InventarioService } from '../../core/services/inventario.service';
import { VentasService } from '../../core/services/ventas.service';
import { ClientesService } from '../../core/services/clientes.service';
import { ConfiguracionService } from '../../core/services/configuracion.service';
import {
  Inventario,
  LoteProduccion,
  CajaDiaria,
} from '../../core/models/interfaces';
import {
  formatearMoneda,
  calcularValorInventario,
  calcularRendimientoPromedio,
} from '../../core/utils/calculos.utils';
import { Observable, combineLatest, map } from 'rxjs';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';

interface ResumenDashboard {
  // Finanzas del día
  efectivoHoy: number;
  ventasTotalesHoy: number;
  costoVendidoHoy: number;
  utilidadBrutaHoy: number; // (Efectivo + Fiado) - Costo
  margenHoy: number; // Porcentaje

  // Desglose
  ventasEfectivoHoy: number;
  ventasFiadoHoy: number;
  abonosHoy: number;

  // Capital Global
  valorInventario: number;
  dineroEnCalle: number;
  capitalTotal: number;

  // Operativo
  totalBolsas: number;
  clientesConDeuda: number;
  rendimientoPromedio: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, SkeletonComponent, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private inventarioService = inject(InventarioService);
  private ventasService = inject(VentasService);
  private clientesService = inject(ClientesService);
  private configuracionService = inject(ConfiguracionService);
  fechaHoy = new Date();

  resumen$!: Observable<ResumenDashboard>;
  lotes$!: Observable<LoteProduccion[]>;
  nombreNegocio = 'Control Cacahuate';

  // Datos para gráfico de dona (calculados en el template o aquí)
  chartData = { inventario: 0, calle: 0 };

  ngOnInit() {
    this.configuracionService.config$.subscribe((config) => {
      if (config) {
        this.nombreNegocio = config.nombreNegocio;
      }
    });

    this.lotes$ = this.inventarioService.getLotes$();

    this.resumen$ = combineLatest([
      this.inventarioService.getInventario$(),
      this.ventasService.getCajaDia$(),
      this.clientesService.getClientes$(),
      this.inventarioService.getLotes$(),
    ]).pipe(
      map(([inventarios, caja, clientes, lotes]) => {
        // --- CÁLCULOS GLOBALES ---
        const valorInventario = calcularValorInventario(inventarios);
        const totalBolsas = inventarios.reduce(
          (sum, inv) => sum + inv.cantidad,
          0
        );
        const dineroEnCalle = clientes.reduce(
          (sum, c) => sum + c.saldoPendiente,
          0
        );
        const clientesConDeuda = clientes.filter(
          (c) => c.saldoPendiente > 0
        ).length;
        const rendimientoPromedio = calcularRendimientoPromedio(lotes);

        // --- CÁLCULOS DEL DÍA ---
        const efectivoVentas = caja?.efectivoVentas || 0;
        const efectivoAbonos = caja?.efectivoAbonos || 0;
        const ventasFiado = caja?.ventasFiado || 0;
        const costoVendido = caja?.costoVendido || 0;

        // Flujo de Caja (Lo que tienes en la mano)
        const efectivoHoy = efectivoVentas + efectivoAbonos;

        // Estado de Resultados (Lo que realmente vendiste y ganaste)
        const ventasTotalesHoy = efectivoVentas + ventasFiado;
        const utilidadBrutaHoy = ventasTotalesHoy - costoVendido;

        const margenHoy =
          ventasTotalesHoy > 0
            ? (utilidadBrutaHoy / ventasTotalesHoy) * 100
            : 0;

        // Para gráficos
        this.chartData = {
          inventario: valorInventario,
          calle: dineroEnCalle,
        };

        return {
          efectivoHoy,
          ventasTotalesHoy,
          costoVendidoHoy: costoVendido,
          utilidadBrutaHoy,
          margenHoy,
          ventasEfectivoHoy: efectivoVentas,
          ventasFiadoHoy: ventasFiado,
          abonosHoy: efectivoAbonos,
          valorInventario,
          dineroEnCalle,
          capitalTotal: valorInventario + dineroEnCalle,
          totalBolsas,
          clientesConDeuda,
          rendimientoPromedio,
        };
      })
    );
  }

  formatearMoneda(valor: number): string {
    return formatearMoneda(valor);
  }

  // Helpers para rendimiento
  getBestRendimiento(lotes: LoteProduccion[]): number {
    if (lotes.length === 0) return 0;
    return Math.max(...lotes.map((l) => l.bolsasResultantes));
  }

  getWorstRendimiento(lotes: LoteProduccion[]): number {
    if (lotes.length === 0) return 0;
    return Math.min(...lotes.map((l) => l.bolsasResultantes));
  }

  // Helper para gráfico de dona SVG
  getCircleDashArray(percentage: number): string {
    // Circunferencia de radio 16 aprox = 100
    // r=15.9155, C=2*pi*r ≈ 100
    return `${percentage}, 100`;
  }
}
