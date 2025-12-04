import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SaboresService } from '../../core/services/sabores.service';
import { InventarioService } from '../../core/services/inventario.service';
import { VentasService } from '../../core/services/ventas.service';
import { ClientesService } from '../../core/services/clientes.service';
import { ConfiguracionService } from '../../core/services/configuracion.service';
import { Sabor, Inventario, Cliente } from '../../core/models/interfaces';
import { formatearMoneda } from '../../core/utils/calculos.utils';
import { Observable, combineLatest, map } from 'rxjs';

interface SaborConInventario extends Sabor {
  cantidad: number;
  costoPromedio: number;
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.scss',
})
export class PosComponent implements OnInit {
  private saboresService = inject(SaboresService);
  private inventarioService = inject(InventarioService);
  private ventasService = inject(VentasService);
  private clientesService = inject(ClientesService);
  private configuracionService = inject(ConfiguracionService);

  saboresConInventario$!: Observable<SaborConInventario[]>;
  clientes$!: Observable<Cliente[]>;

  precioVenta = 10;
  efectivoHoy = 0;
  fiadoHoy = 0;

  // Modal de pago
  modalVisible = false;
  saborSeleccionado: SaborConInventario | null = null;
  clienteSeleccionado: Cliente | null = null;

  // Modal nuevo cliente
  modalNuevoCliente = false;
  nuevoClienteAlias = '';

  // Estado de carga
  procesando = false;
  mensaje = '';

  ngOnInit() {
    // Combinar sabores con inventario
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

    this.clientes$ = this.clientesService.getClientes$();

    // Cargar configuración
    this.configuracionService.config$.subscribe((config) => {
      if (config) {
        this.precioVenta = config.precioVentaDefault;
      }
    });

    // Cargar caja del día
    this.ventasService.getCajaDia$().subscribe((caja) => {
      if (caja) {
        this.efectivoHoy = caja.efectivoVentas + caja.efectivoAbonos;
        this.fiadoHoy = caja.ventasFiado;
      }
    });
  }

  formatearMoneda(valor: number): string {
    return formatearMoneda(valor);
  }

  abrirModalPago(sabor: SaborConInventario) {
    if (sabor.cantidad <= 0) {
      this.mostrarMensaje('Sin stock disponible', true);
      return;
    }
    this.saborSeleccionado = sabor;
    this.modalVisible = true;
  }

  cerrarModal() {
    this.modalVisible = false;
    this.saborSeleccionado = null;
    this.clienteSeleccionado = null;
  }

  async venderEfectivo() {
    if (!this.saborSeleccionado || this.procesando) return;

    this.procesando = true;
    const resultado = await this.ventasService.procesarVenta({
      saborId: this.saborSeleccionado.id,
      tipoPago: 'efectivo',
      precioVenta: this.precioVenta,
    });

    if (resultado.success) {
      this.mostrarMensaje('¡Venta registrada!');
      this.cerrarModal();
    } else {
      this.mostrarMensaje(resultado.error || 'Error al procesar', true);
    }
    this.procesando = false;
  }

  async venderFiado(cliente: Cliente) {
    if (!this.saborSeleccionado || this.procesando) return;

    this.procesando = true;
    const resultado = await this.ventasService.procesarVenta({
      saborId: this.saborSeleccionado.id,
      tipoPago: 'fiado',
      clienteId: cliente.id,
      precioVenta: this.precioVenta,
    });

    if (resultado.success) {
      this.mostrarMensaje(`Fiado a ${cliente.alias}`);
      this.cerrarModal();
    } else {
      this.mostrarMensaje(resultado.error || 'Error al procesar', true);
    }
    this.procesando = false;
  }

  abrirModalNuevoCliente() {
    this.modalNuevoCliente = true;
  }

  cerrarModalNuevoCliente() {
    this.modalNuevoCliente = false;
    this.nuevoClienteAlias = '';
  }

  async crearClienteYFiar() {
    if (
      !this.nuevoClienteAlias.trim() ||
      !this.saborSeleccionado ||
      this.procesando
    )
      return;

    this.procesando = true;

    try {
      // Crear cliente
      const nuevoCliente = await this.clientesService.crearCliente({
        alias: this.nuevoClienteAlias.trim(),
      });

      // Procesar venta fiada
      const resultado = await this.ventasService.procesarVenta({
        saborId: this.saborSeleccionado.id,
        tipoPago: 'fiado',
        clienteId: nuevoCliente.id,
        precioVenta: this.precioVenta,
      });

      if (resultado.success) {
        this.mostrarMensaje(`Cliente creado y fiado a ${nuevoCliente.alias}`);
        this.cerrarModalNuevoCliente();
        this.cerrarModal();
      } else {
        this.mostrarMensaje(resultado.error || 'Error al procesar', true);
      }
    } catch (error) {
      this.mostrarMensaje('Error al crear cliente', true);
    }

    this.procesando = false;
  }

  private mostrarMensaje(texto: string, esError = false) {
    this.mensaje = texto;
    setTimeout(() => (this.mensaje = ''), 3000);
  }
}
