import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { InventarioService } from '../../core/services/inventario.service';
import { VentasService } from '../../core/services/ventas.service';
import { ClientesService } from '../../core/services/clientes.service';
import { ConfiguracionService } from '../../core/services/configuracion.service';
import { LoteProduccion, Venta } from '../../core/models/interfaces';
import {
  formatearMoneda,
  calcularValorInventario,
  calcularRendimientoPromedio,
} from '../../core/utils/calculos.utils';
import { Observable, combineLatest, map } from 'rxjs';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';

interface ResumenDashboard {
  efectivoHoy: number;
  ventasTotalesHoy: number;
  costoVendidoHoy: number;
  utilidadBrutaHoy: number;
  margenHoy: number;
  ventasEfectivoHoy: number;
  ventasFiadoHoy: number;
  abonosHoy: number;
  valorInventario: number;
  dineroEnCalle: number;
  capitalTotal: number;
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

  resumen$!: Observable<ResumenDashboard>;
  lotes$!: Observable<LoteProduccion[]>;
  nombreNegocio = 'Control Cacahuate';
  fechaHoy = new Date();
  chartData = { inventario: 0, calle: 0 };

  ngOnInit() {
    this.configuracionService.config$.subscribe((config) => {
      if (config) {
        this.nombreNegocio = config.nombreNegocio;
      }
    });

    this.lotes$ = this.inventarioService.getLotes$();

    // USAMOS getVentasHoyReales$ PARA SUMAR EN VIVO
    this.resumen$ = combineLatest([
      this.inventarioService.getInventario$(),
      this.ventasService.getVentasHoyReales$(), // Fuente real
      this.ventasService.getCajaDia$(), // Solo para abonos
      this.clientesService.getClientes$(),
      this.inventarioService.getLotes$(),
    ]).pipe(
      map(([inventarios, ventasHoy, cajaDia, clientes, lotes]) => {
        // SUMA MANUAL DE VENTAS (Corrección de datos)
        let ventasEfectivo = 0;
        let ventasFiado = 0;
        let costoVendido = 0;

        ventasHoy.forEach((v) => {
          const totalVenta = v.cantidad * v.precioUnitario;
          const costoVenta = v.cantidad * v.costoUnitario;

          if (v.tipoPago === 'efectivo') {
            ventasEfectivo += totalVenta;
          } else {
            ventasFiado += totalVenta;
          }
          costoVendido += costoVenta;
        });

        // Abonos los tomamos de la caja (si no moviste la colección de abonos)
        const efectivoAbonos = cajaDia?.efectivoAbonos || 0;

        // CÁLCULOS GLOBALES
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

        // RESULTADOS
        const efectivoHoy = ventasEfectivo + efectivoAbonos;
        const ventasTotalesHoy = ventasEfectivo + ventasFiado;
        const utilidadBrutaHoy = ventasTotalesHoy - costoVendido;

        const margenHoy =
          ventasTotalesHoy > 0
            ? (utilidadBrutaHoy / ventasTotalesHoy) * 100
            : 0;

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
          ventasEfectivoHoy: ventasEfectivo,
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

  getBestRendimiento(lotes: LoteProduccion[]): number {
    if (lotes.length === 0) return 0;
    return Math.max(...lotes.map((l) => l.bolsasResultantes));
  }

  getWorstRendimiento(lotes: LoteProduccion[]): number {
    if (lotes.length === 0) return 0;
    return Math.min(...lotes.map((l) => l.bolsasResultantes));
  }

  getCircleDashArray(percentage: number): string {
    return `${percentage}, 100`;
  }
}
