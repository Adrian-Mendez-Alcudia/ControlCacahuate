import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SaboresService } from '../../core/services/sabores.service';
import { InventarioService } from '../../core/services/inventario.service';
import { VentasService } from '../../core/services/ventas.service';
import { ClientesService } from '../../core/services/clientes.service';
import { ConfiguracionService } from '../../core/services/configuracion.service';
import { CarritoService } from '../../core/services/carrito.service';
import { Sabor, Cliente } from '../../core/models/interfaces';
import { formatearMoneda } from '../../core/utils/calculos.utils';
import { Observable, combineLatest, map, tap } from 'rxjs';

// Interfaz local para la vista
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
  public carritoService = inject(CarritoService);

  // Observables para la vista
  saboresConInventario$!: Observable<SaborConInventario[]>;
  clientes$!: Observable<Cliente[]>;

  // Variables locales para lógica síncrona
  saboresList: SaborConInventario[] = [];

  precioVenta = 10;
  efectivoHoy = 0;
  fiadoHoy = 0;

  // Modales
  modalCobroVisible = false;
  modalNuevoCliente = false;
  nuevoClienteAlias = '';

  // Estado
  procesando = false;
  mensaje = '';
  mensajeError = false;

  ngOnInit() {
    // 1. Combinamos datos y guardamos una copia local en 'saboresList'
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
      }),
      tap((sabores) => {
        // Guardamos la lista actualizada para usarla en agregarAlCarrito
        this.saboresList = sabores;
      })
    );

    this.clientes$ = this.clientesService.getClientes$();

    this.configuracionService.config$.subscribe((config) => {
      if (config) {
        this.precioVenta = config.precioVentaDefault;
      }
    });

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

  // ========== ACCIONES DEL CARRITO ==========

  // CORRECCIÓN: Ahora aceptamos cualquier objeto que tenga un ID (Sabor o SaborConInventario)
  agregarAlCarrito(saborPartial: { id: string }) {
    // Buscamos el sabor completo con sus datos de inventario actuales
    const saborCompleto = this.saboresList.find(
      (s) => s.id === saborPartial.id
    );

    if (!saborCompleto) {
      this.mostrarMensaje('Error al localizar el producto', true);
      return;
    }

    const cantidadEnCarrito = this.carritoService.obtenerCantidad(
      saborCompleto.id
    );

    // Validamos contra el stock real
    if (cantidadEnCarrito >= saborCompleto.cantidad) {
      this.mostrarMensaje('No hay suficiente stock', true);
      return;
    }

    // Pasamos el sabor completo al servicio
    this.carritoService.agregarItem(
      saborCompleto,
      this.precioVenta,
      saborCompleto.cantidad
    );
  }

  restarDelCarrito(sabor: { id: string }) {
    this.carritoService.restarItem(sabor.id);
  }

  // ========== MODALES ==========

  abrirModalCobrar() {
    if (this.carritoService.cantidadItems() === 0) {
      this.mostrarMensaje('El carrito está vacío', true);
      return;
    }
    this.modalCobroVisible = true;
  }

  cerrarModal() {
    this.modalCobroVisible = false;
  }

  abrirModalNuevoCliente() {
    this.modalNuevoCliente = true;
  }

  cerrarModalNuevoCliente() {
    this.modalNuevoCliente = false;
    this.nuevoClienteAlias = '';
  }

  // ========== PROCESAMIENTO DE VENTAS ==========

  async procesarVentaCarrito(
    tipoPago: 'efectivo' | 'fiado',
    clienteId?: string
  ) {
    const items = this.carritoService.carrito();
    if (this.procesando || items.length === 0) return;

    this.procesando = true;
    let errores = 0;
    let exitos = 0;

    try {
      for (const item of items) {
        for (let i = 0; i < item.cantidad; i++) {
          const resultado = await this.ventasService.procesarVenta({
            saborId: item.sabor.id,
            tipoPago: tipoPago,
            clienteId: clienteId,
            precioVenta: item.precioVenta,
          });

          if (resultado.success) {
            exitos++;
          } else {
            errores++;
          }
        }
      }

      if (errores === 0) {
        this.mostrarMensaje(
          tipoPago === 'fiado'
            ? '¡Todo fiado correctamente!'
            : '¡Venta registrada!'
        );
        this.carritoService.limpiarCarrito();
        this.cerrarModal();
      } else {
        this.mostrarMensaje(
          `Se vendieron ${exitos}, pero hubo ${errores} errores.`,
          true
        );
        if (exitos > 0) this.carritoService.limpiarCarrito();
        this.cerrarModal();
      }
    } catch (error) {
      console.error('Error procesando carrito:', error);
      this.mostrarMensaje('Ocurrió un error inesperado', true);
    }

    this.procesando = false;
  }

  async venderEfectivo() {
    await this.procesarVentaCarrito('efectivo');
  }

  async venderFiado(cliente: Cliente) {
    await this.procesarVentaCarrito('fiado', cliente.id);
  }

  async crearClienteYFiar() {
    if (!this.nuevoClienteAlias.trim()) {
      this.mostrarMensaje('Ingresa un nombre', true);
      return;
    }

    if (this.procesando) return;
    this.procesando = true;

    try {
      const nuevoCliente = await this.clientesService.crearCliente({
        alias: this.nuevoClienteAlias.trim(),
      });

      this.procesando = false;
      this.cerrarModalNuevoCliente();
      await this.venderFiado(nuevoCliente);
    } catch (error) {
      console.error('Error:', error);
      this.mostrarMensaje('Error al crear cliente', true);
      this.procesando = false;
    }
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
