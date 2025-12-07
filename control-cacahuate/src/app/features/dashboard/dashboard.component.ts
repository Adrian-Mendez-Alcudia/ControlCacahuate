import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component'; // Importar

interface ResumenDashboard {
  efectivoHoy: number;
  utilidadHoy: number;
  valorInventario: number;
  totalBolsas: number;
  dineroEnCalle: number;
  clientesConDeuda: number;
  rendimientoPromedio: number;
  ventasEfectivoHoy: number;
  ventasFiadoHoy: number;
  abonosHoy: number;
  costoVendidoHoy: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, SkeletonComponent], // Agregar SkeletonComponent y RouterModule
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

        const efectivoHoy =
          (caja?.efectivoVentas || 0) + (caja?.efectivoAbonos || 0);
        const utilidadHoy =
          (caja?.efectivoVentas || 0) - (caja?.costoVendido || 0);

        return {
          efectivoHoy,
          utilidadHoy,
          valorInventario,
          totalBolsas,
          dineroEnCalle,
          clientesConDeuda,
          rendimientoPromedio,
          ventasEfectivoHoy: caja?.efectivoVentas || 0,
          ventasFiadoHoy: caja?.ventasFiado || 0,
          abonosHoy: caja?.efectivoAbonos || 0,
          costoVendidoHoy: caja?.costoVendido || 0,
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
}
