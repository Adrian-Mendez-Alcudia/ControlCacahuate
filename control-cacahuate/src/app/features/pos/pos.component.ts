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

interface ItemCarrito {
  sabor: SaborConInventario;
  cantidad: number;
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

  // Carrito de compras
  carrito: ItemCarrito[] = [];
  modalCobroVisible = false;

  // Modal nuevo cliente
  modalNuevoCliente = false;
  nuevoClienteAlias = '';

  // Estado de carga
  procesando = false;
  mensaje = '';
  mensajeError = false;

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

  // ========== LÓGICA DEL CARRITO ==========

  agregarAlCarrito(sabor: SaborConInventario) {
    const index = this.carrito.findIndex((i) => i.sabor.id === sabor.id);
    const cantidadActual = index !== -1 ? this.carrito[index].cantidad : 0;

    if (cantidadActual >= sabor.cantidad) {
      this.mostrarMensaje('No hay suficiente stock', true);
      return;
    }

    if (index !== -1) {
      // Actualizamos creando un nuevo objeto para asegurar detección de cambios
      const item = { ...this.carrito[index] };
      item.cantidad++;
      const nuevoCarrito = [...this.carrito];
      nuevoCarrito[index] = item;
      this.carrito = nuevoCarrito;
    } else {
      // Agregamos al array creando una nueva referencia
      this.carrito = [...this.carrito, { sabor, cantidad: 1 }];
    }
  }

  restarDelCarrito(sabor: SaborConInventario) {
    const index = this.carrito.findIndex((i) => i.sabor.id === sabor.id);
    if (index !== -1) {
      const item = { ...this.carrito[index] };
      item.cantidad--;

      const nuevoCarrito = [...this.carrito];
      if (item.cantidad <= 0) {
        nuevoCarrito.splice(index, 1);
      } else {
        nuevoCarrito[index] = item;
      }
      this.carrito = nuevoCarrito;
    }
  }

  getCantidadEnCarrito(saborId: string): number {
    const item = this.carrito.find((i) => i.sabor.id === saborId);
    return item ? item.cantidad : 0;
  }

  get totalCarrito(): number {
    return this.carrito.reduce(
      (total, item) => total + item.cantidad * this.precioVenta,
      0
    );
  }

  get cantidadTotalItems(): number {
    return this.carrito.reduce((total, item) => total + item.cantidad, 0);
  }

  limpiarCarrito() {
    this.carrito = [];
    this.cerrarModal();
  }

  // ========== MODALES ==========

  abrirModalCobrar() {
    if (this.carrito.length === 0) {
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
    if (this.procesando || this.carrito.length === 0) return;

    this.procesando = true;
    let errores = 0;
    let exitos = 0;

    try {
      // Iteramos sobre cada item del carrito
      for (const item of this.carrito) {
        // Como el servicio procesa de 1 en 1, hacemos un bucle por la cantidad
        for (let i = 0; i < item.cantidad; i++) {
          const resultado = await this.ventasService.procesarVenta({
            saborId: item.sabor.id,
            tipoPago: tipoPago,
            clienteId: clienteId,
            precioVenta: this.precioVenta,
          });

          if (resultado.success) {
            exitos++;
          } else {
            errores++;
            console.error(
              `Error vendiendo ${item.sabor.nombre}:`,
              resultado.error
            );
          }
        }
      }

      if (errores === 0) {
        this.mostrarMensaje(
          tipoPago === 'fiado'
            ? '¡Todo fiado correctamente!'
            : '¡Venta registrada!'
        );
        this.limpiarCarrito();
      } else {
        this.mostrarMensaje(
          `Se vendieron ${exitos}, pero hubo ${errores} errores.`,
          true
        );
        if (exitos > 0) this.limpiarCarrito();
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
