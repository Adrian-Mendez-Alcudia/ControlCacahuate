import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SaboresService } from '../../core/services/sabores.service';
import { InventarioService } from '../../core/services/inventario.service';
import { VentasService } from '../../core/services/ventas.service';
import { ClientesService } from '../../core/services/clientes.service';
import { ConfiguracionService } from '../../core/services/configuracion.service';
import { CarritoService } from '../../core/services/carrito.service';
import { Sabor, Cliente, Venta } from '../../core/models/interfaces';
import { formatearMoneda, generarId } from '../../core/utils/calculos.utils';
import { Observable, combineLatest, map, tap } from 'rxjs';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';

// Interfaz extendida para la vista
interface SaborConInventario extends Sabor {
  cantidad: number;
  costoPromedio: number;
}

// Nueva interfaz para el historial agrupado (Ticket)
interface TicketVenta {
  transactionId: string;
  fecha: any; // Timestamp
  total: number;
  items: Venta[];
  tipoPago: 'efectivo' | 'fiado';
  clienteNombre?: string;
  notas?: string;
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
  public carritoService = inject(CarritoService);

  // Data Streams
  saboresConInventario$!: Observable<SaborConInventario[]>;
  ticketsHoy$!: Observable<TicketVenta[]>; // CAMBIO: Ahora son tickets, no ventas sueltas

  // Clientes Local
  clientes: Cliente[] = [];
  clientesFiltrados: Cliente[] = [];
  terminoBusqueda = '';

  // Estado Local
  saboresMap = new Map<string, SaborConInventario>();
  precioVenta = 10;
  efectivoHoy = 0;
  fiadoHoy = 0;

  // Modales
  modalCobroVisible = false;
  modalNuevoCliente = false;
  modalHistorialVisible = false;
  modalEditarVentaVisible = false;
  nuevoClienteAlias = '';

  // Edición de Ticket
  ticketSeleccionado: TicketVenta | null = null;
  notaEdicion = '';

  // Feedback UI
  procesando = false;
  mensaje = '';
  mensajeError = false;

  ngOnInit() {
    this.cargarDatos();
  }

  cargarDatos() {
    // 1. Cargar productos e inventario
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
        this.saboresMap.clear();
        sabores.forEach((s) => this.saboresMap.set(s.id, s));
      })
    );

    // 2. Cargar Clientes
    this.clientesService.getClientes$().subscribe((data) => {
      this.clientes = data;
      this.filtrarClientes();
    });

    // 3. Configuración
    this.configuracionService.config$.subscribe((config) => {
      if (config) this.precioVenta = config.precioVentaDefault;
    });

    // 4. Caja del día
    this.ventasService.getCajaDia$().subscribe((caja) => {
      if (caja) {
        this.efectivoHoy =
          (caja.efectivoVentas || 0) + (caja.efectivoAbonos || 0);
        this.fiadoHoy = caja.ventasFiado || 0;
      }
    });

    // 5. Historial Agrupado (MAGIA AQUÍ)
    this.ticketsHoy$ = this.ventasService.getVentasHoy$().pipe(
      map((ventas) => {
        const grupos = new Map<string, TicketVenta>();

        ventas.forEach((venta) => {
          // Usamos transactionId si existe, si no, agrupamos por id (legacy)
          const tId = venta.transactionId || venta.id;

          if (!grupos.has(tId)) {
            grupos.set(tId, {
              transactionId: tId,
              fecha: venta.fecha,
              total: 0,
              items: [],
              tipoPago: venta.tipoPago,
              clienteNombre: venta.clienteId
                ? this.getNombreCliente(venta.clienteId)
                : undefined,
              notas: venta.notas, // Tomamos la nota de cualquier item del grupo
            });
          }

          const grupo = grupos.get(tId)!;
          grupo.items.push(venta);
          grupo.total += venta.cantidad * venta.precioUnitario;
        });

        // Convertir Map a Array y ordenar por fecha
        return Array.from(grupos.values()).sort(
          (a, b) => b.fecha.toMillis() - a.fecha.toMillis()
        );
      })
    );
  }

  // Lógica de filtrado
  filtrarClientes() {
    if (!this.terminoBusqueda.trim()) {
      this.clientesFiltrados = this.clientes;
    } else {
      const termino = this.terminoBusqueda.toLowerCase();
      this.clientesFiltrados = this.clientes.filter((c) =>
        c.alias.toLowerCase().includes(termino)
      );
    }
  }

  getIniciales(nombre: string): string {
    return nombre ? nombre.substring(0, 2).toUpperCase() : '??';
  }

  getNombreCliente(id: string): string {
    const c = this.clientes.find((cli) => cli.id === id);
    return c ? c.alias : 'Desconocido';
  }

  // ==========================================
  // LÓGICA DEL CARRITO
  // ==========================================

  agregarAlCarrito(saborParcial: { id: string }) {
    const saborReal = this.saboresMap.get(saborParcial.id);
    if (!saborReal) return;

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

    if (navigator.vibrate) navigator.vibrate(50);
  }

  restarDelCarrito(saborParcial: { id: string }) {
    this.carritoService.restarItem(saborParcial.id);
    if (navigator.vibrate) navigator.vibrate(30);
  }

  getCantidadEnCarrito(id: string): number {
    return this.carritoService.obtenerCantidad(id);
  }

  // ==========================================
  // PROCESAMIENTO DE VENTAS (Con Transaction ID)
  // ==========================================

  async procesarVenta(tipoPago: 'efectivo' | 'fiado', clienteId?: string) {
    const items = this.carritoService.carrito();
    if (items.length === 0 || this.procesando) return;

    this.procesando = true;
    let errores = 0;

    // GENERAMOS UN ID DE TRANSACCIÓN ÚNICO PARA TODO EL CARRITO
    const transactionId = generarId();

    const promesasVenta = items.map((item) =>
      this.ventasService.procesarVenta({
        saborId: item.sabor.id,
        cantidad: item.cantidad,
        tipoPago,
        clienteId,
        precioVenta: item.precioVenta,
        nombreSaborSnapshot: item.sabor.nombre,
        transactionId: transactionId, // <--- ESTO UNE AL GRUPO
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

  venderEfectivo() {
    this.procesarVenta('efectivo');
  }

  venderFiado(cliente: Cliente) {
    this.procesarVenta('fiado', cliente.id);
  }

  // ==========================================
  // HISTORIAL Y EDICIÓN (A NIVEL TICKET)
  // ==========================================

  abrirHistorial() {
    this.modalHistorialVisible = true;
  }

  cerrarHistorial() {
    this.modalHistorialVisible = false;
  }

  abrirEditarTicket(ticket: TicketVenta) {
    this.ticketSeleccionado = ticket;
    this.notaEdicion = ticket.notas || '';
    this.modalEditarVentaVisible = true;
  }

  cerrarEditarVenta() {
    this.modalEditarVentaVisible = false;
    this.ticketSeleccionado = null;
    this.notaEdicion = '';
  }

  async guardarNotaVenta() {
    if (!this.ticketSeleccionado) return;

    this.procesando = true;
    try {
      // Actualizamos usando el transactionId del ticket
      await this.ventasService.actualizarNotaTransaccion(
        this.ticketSeleccionado.transactionId,
        this.notaEdicion
      );
      this.mostrarMensaje('Nota de ticket actualizada');
      this.cerrarEditarVenta();
    } catch (e) {
      this.mostrarMensaje('Error al guardar nota', true);
    } finally {
      this.procesando = false;
    }
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
    this.terminoBusqueda = '';
    this.filtrarClientes();
    this.modalCobroVisible = true;
  }

  cerrarModal() {
    this.modalCobroVisible = false;
  }

  abrirModalNuevoCliente() {
    this.modalNuevoCliente = true;
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
