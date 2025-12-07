import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SaboresService } from '../../core/services/sabores.service';
import { InventarioService } from '../../core/services/inventario.service';
import { VentasService } from '../../core/services/ventas.service';
import { ClientesService } from '../../core/services/clientes.service';
import { ConfiguracionService } from '../../core/services/configuracion.service';
import { CarritoService } from '../../core/services/carrito.service'; // Asegúrate de importar esto
import { Sabor, Cliente } from '../../core/models/interfaces';
import { formatearMoneda } from '../../core/utils/calculos.utils';
import { Observable, combineLatest, map, tap } from 'rxjs';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';

// Interfaz extendida para la vista
interface SaborConInventario extends Sabor {
  cantidad: number;
  costoPromedio: number;
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, SkeletonComponent],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.scss',
})
export class PosComponent implements OnInit {
  // Inyección de dependencias
  private saboresService = inject(SaboresService);
  private inventarioService = inject(InventarioService);
  private ventasService = inject(VentasService);
  private clientesService = inject(ClientesService);
  private configuracionService = inject(ConfiguracionService);
  public carritoService = inject(CarritoService); // Inyección pública para el HTML

  // Data Streams
  saboresConInventario$!: Observable<SaborConInventario[]>;
  clientes$!: Observable<Cliente[]>;

  // Estado Local
  saboresMap = new Map<string, SaborConInventario>();
  precioVenta = 10;
  efectivoHoy = 0;
  fiadoHoy = 0;

  // Modales
  modalCobroVisible = false;
  modalNuevoCliente = false;
  nuevoClienteAlias = '';

  // Feedback UI
  procesando = false;
  mensaje = '';
  mensajeError = false;

  ngOnInit() {
    this.cargarDatos();
  }

  cargarDatos() {
    // Combinar Sabores + Inventario en un solo stream
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
        // Guardamos referencia rápida para validaciones
        this.saboresMap.clear();
        sabores.forEach((s) => this.saboresMap.set(s.id, s));
      })
    );

    this.clientes$ = this.clientesService.getClientes$();

    this.configuracionService.config$.subscribe((config) => {
      if (config) this.precioVenta = config.precioVentaDefault;
    });

    this.ventasService.getCajaDia$().subscribe((caja) => {
      if (caja) {
        this.efectivoHoy =
          (caja.efectivoVentas || 0) + (caja.efectivoAbonos || 0);
        this.fiadoHoy = caja.ventasFiado || 0;
      }
    });
  }

  // ==========================================
  // LÓGICA DEL CARRITO (Puente al Servicio)
  // ==========================================

  agregarAlCarrito(saborParcial: { id: string }) {
    const saborReal = this.saboresMap.get(saborParcial.id);
    if (!saborReal) return;

    // Validación de stock
    const cantidadEnCarrito = this.carritoService.obtenerCantidad(saborReal.id);
    if (cantidadEnCarrito >= saborReal.cantidad) {
      this.mostrarMensaje(`Solo hay ${saborReal.cantidad} disponibles`, true);
      return;
    }

    this.carritoService.agregarItem(
      saborReal,
      this.precioVenta,
      saborReal.cantidad
    );

    if (navigator.vibrate) navigator.vibrate(50); // Feedback táctil
  }

  restarDelCarrito(saborParcial: { id: string }) {
    this.carritoService.restarItem(saborParcial.id);
    if (navigator.vibrate) navigator.vibrate(30);
  }

  getCantidadEnCarrito(id: string): number {
    return this.carritoService.obtenerCantidad(id);
  }

  // ==========================================
  // PROCESAMIENTO DE VENTAS
  // ==========================================

  async procesarVenta(tipoPago: 'efectivo' | 'fiado', clienteId?: string) {
    const items = this.carritoService.carrito(); // Obtenemos valor del Signal
    if (items.length === 0 || this.procesando) return;

    this.procesando = true;
    let errores = 0;

    // Procesamos todos los items en paralelo
    const promesasVenta = items.map((item) =>
      this.ventasService.procesarVenta({
        saborId: item.sabor.id,
        cantidad: item.cantidad,
        tipoPago,
        clienteId,
        precioVenta: item.precioVenta,
        nombreSaborSnapshot: item.sabor.nombre, // Para historial
      })
    );

    const resultados = await Promise.all(promesasVenta);

    resultados.forEach((res) => {
      if (!res.success) {
        errores++;
        console.warn(res.error);
      }
    });

    this.procesando = false;

    if (errores === 0) {
      this.mostrarMensaje(
        tipoPago === 'efectivo' ? '¡Venta Exitosa! 💵' : '¡Fiado Registrado! 📝'
      );
      this.carritoService.limpiarCarrito();
      this.cerrarModal();
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } else {
      this.mostrarMensaje(
        `Problemas con ${errores} productos (revisar stock)`,
        true
      );
    }
  }

  // Wrappers para la vista HTML
  venderEfectivo() {
    this.procesarVenta('efectivo');
  }

  venderFiado(cliente: Cliente) {
    this.procesarVenta('fiado', cliente.id);
  }

  // ==========================================
  // GESTIÓN DE CLIENTES RÁPIDA
  // ==========================================

  async crearClienteYFiar() {
    const alias = this.nuevoClienteAlias.trim();
    if (!alias) {
      this.mostrarMensaje('Escribe un nombre', true);
      return;
    }

    this.procesando = true;
    try {
      const cliente = await this.clientesService.crearCliente({ alias });
      this.procesando = false;
      this.modalNuevoCliente = false;
      this.nuevoClienteAlias = '';
      this.venderFiado(cliente);
    } catch (e) {
      this.procesando = false;
      this.mostrarMensaje('Error creando cliente', true);
    }
  }

  // ==========================================
  // UI & HELPERS
  // ==========================================

  abrirModalCobrar() {
    if (this.carritoService.cantidadItems() === 0) {
      this.mostrarMensaje('Carrito vacío', true);
      return;
    }
    this.modalCobroVisible = true;
  }

  cerrarModal() {
    this.modalCobroVisible = false;
  }

  abrirModalNuevoCliente() {
    this.modalNuevoCliente = true;
    // Hack para enfocar el input
    setTimeout(() => {
      const input = document.getElementById('inputNuevoCliente');
      if (input) input.focus();
    }, 100);
  }

  cerrarModalNuevoCliente() {
    this.modalNuevoCliente = false;
  }

  mostrarMensaje(texto: string, error = false) {
    this.mensaje = texto;
    this.mensajeError = error;
    setTimeout(() => {
      this.mensaje = '';
      this.mensajeError = false;
    }, 3000);
  }

  formatearMoneda(val: number) {
    return formatearMoneda(val);
  }
}
