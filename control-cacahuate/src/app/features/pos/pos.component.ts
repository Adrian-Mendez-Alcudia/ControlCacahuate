import { Component, inject, OnInit, OnDestroy } from '@angular/core'; // Agregamos OnDestroy
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SaboresService } from '../../core/services/sabores.service';
import { InventarioService } from '../../core/services/inventario.service';
import { VentasService } from '../../core/services/ventas.service';
import { ClientesService } from '../../core/services/clientes.service';
import { ConfiguracionService } from '../../core/services/configuracion.service';
import { CarritoService } from '../../core/services/carrito.service';
import { Sabor, Cliente, Venta } from '../../core/models/interfaces';
import { formatearMoneda } from '../../core/utils/calculos.utils';
import { Observable, combineLatest, map, tap, Subscription } from 'rxjs'; // Importamos Subscription
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';

interface SaborConInventario extends Sabor {
  cantidad: number;
  costoPromedio: number;
}

interface TicketVenta {
  idPrincipal: string;
  fecha: any;
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
export class PosComponent implements OnInit, OnDestroy {
  private saboresService = inject(SaboresService);
  private inventarioService = inject(InventarioService);
  private ventasService = inject(VentasService);
  private clientesService = inject(ClientesService);
  private configuracionService = inject(ConfiguracionService);
  public carritoService = inject(CarritoService);

  saboresConInventario$!: Observable<SaborConInventario[]>;
  dineroEnCalle$!: Observable<number>;

  // Variables para clientes
  clientesLista: Cliente[] = [];
  clientesFiltrados: Cliente[] = [];
  clientesSubscription!: Subscription; // Para limpiar memoria

  saboresMap = new Map<string, SaborConInventario>();
  precioVenta = 10;

  // Totales footer
  efectivoHoy = 0;
  fiadoHoy = 0;

  terminoBusqueda = '';

  modalCobroVisible = false;
  modalNuevoCliente = false;
  nuevoClienteAlias = '';

  modalHistorialVisible = false;
  modalEditarNotaVisible = false;
  ticketsHistorial: TicketVenta[] = [];
  ticketSeleccionado: TicketVenta | null = null;
  notaEdicion = '';

  procesando = false;
  mensaje = '';
  mensajeError = false;

  ngOnInit() {
    this.cargarDatos();
  }

  ngOnDestroy() {
    // Buena práctica: desconectar la suscripción al salir para no dejar fugas de memoria
    if (this.clientesSubscription) {
      this.clientesSubscription.unsubscribe();
    }
  }

  cargarDatos() {
    // 1. Deuda Total (Observable directo, se maneja con | async en HTML si se usa)
    this.dineroEnCalle$ = this.clientesService.getDineroEnCalle$();

    // 2. Inventario y Sabores
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

    // 3. CORRECCIÓN AQUÍ: Suscripción explícita a Clientes
    // Antes solo definíamos el observable y nadie lo llamaba.
    this.clientesSubscription = this.clientesService
      .getClientes$()
      .subscribe((clientes) => {
        this.clientesLista = clientes;
        this.filtrarClientes(); // Actualizar lista filtrada inicial
        console.log('Clientes cargados en POS:', clientes.length); // Debug
      });

    this.configuracionService.config$.subscribe((config) => {
      if (config) this.precioVenta = config.precioVentaDefault;
    });

    // Ventas de hoy
    this.ventasService.getVentasHoyReales$().subscribe((ventas) => {
      this.efectivoHoy = 0;
      this.fiadoHoy = 0;

      ventas.forEach((v) => {
        const total = v.cantidad * v.precioUnitario;
        if (v.tipoPago === 'efectivo') {
          this.efectivoHoy += total;
        } else {
          this.fiadoHoy += total;
        }
      });
    });
  }

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

  filtrarClientes() {
    if (!this.terminoBusqueda) {
      this.clientesFiltrados = this.clientesLista;
    } else {
      const term = this.terminoBusqueda.toLowerCase();
      this.clientesFiltrados = this.clientesLista.filter((c) =>
        c.alias.toLowerCase().includes(term)
      );
    }
  }

  async procesarVentaCarrito(
    tipoPago: 'efectivo' | 'fiado',
    clienteId?: string
  ) {
    const items = this.carritoService.carrito();
    if (items.length === 0 || this.procesando) return;

    this.procesando = true;
    let errores = 0;
    let exitos = 0;

    const promesas = items.map((item) =>
      this.ventasService.procesarVenta({
        saborId: item.sabor.id,
        cantidad: item.cantidad,
        tipoPago,
        clienteId,
        precioVenta: item.precioVenta,
        nombreSaborSnapshot: item.sabor.nombre,
      })
    );

    const resultados = await Promise.all(promesas);

    resultados.forEach((res) => {
      if (!res.success) {
        errores++;
        console.warn(res.error);
      } else {
        exitos++;
      }
    });

    if (errores === 0) {
      this.mostrarMensaje(
        tipoPago === 'efectivo' ? '¡Venta Exitosa! 💵' : '¡Fiado Registrado! 📝'
      );
      this.carritoService.limpiarCarrito();
      this.cerrarModal();
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } else {
      this.mostrarMensaje(
        `Se vendieron ${exitos}, pero hubo ${errores} errores.`,
        true
      );
      if (exitos > 0) this.carritoService.limpiarCarrito();
      this.cerrarModal();
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
    const alias = this.nuevoClienteAlias.trim();
    if (!alias) {
      this.mostrarMensaje('Escribe un nombre', true);
      return;
    }

    if (this.procesando) return;
    this.procesando = true;

    try {
      const cliente = await this.clientesService.crearCliente({ alias });
      this.procesando = false;
      this.modalNuevoCliente = false;
      this.nuevoClienteAlias = '';

      // Actualizamos la lista localmente para que aparezca inmediato
      // (aunque la suscripción lo hará, esto da feedback instantáneo)
      this.clientesLista.push(cliente);
      this.filtrarClientes();

      this.venderFiado(cliente);
    } catch (e) {
      this.procesando = false;
      this.mostrarMensaje('Error creando cliente', true);
    }
  }

  abrirHistorial() {
    this.modalHistorialVisible = true;
    this.ventasService.getUltimasVentas$().subscribe((ventas) => {
      this.agruparVentasEnTickets(ventas);
    });
  }

  cerrarHistorial() {
    this.modalHistorialVisible = false;
  }

  private agruparVentasEnTickets(ventas: Venta[]) {
    const grupos: TicketVenta[] = [];

    ventas.forEach((venta) => {
      const fechaVenta = venta.fecha.toDate().getTime();

      const grupoExistente = grupos.find((g) => {
        const fechaGrupo = g.fecha.toDate().getTime();
        return (
          Math.abs(fechaGrupo - fechaVenta) < 2000 &&
          g.tipoPago === venta.tipoPago &&
          g.clienteNombre === (venta.clienteId || 'Anónimo')
        );
      });

      if (grupoExistente) {
        grupoExistente.items.push(venta);
        grupoExistente.total += venta.cantidad * venta.precioUnitario;
      } else {
        grupos.push({
          idPrincipal: venta.id,
          fecha: venta.fecha,
          total: venta.cantidad * venta.precioUnitario,
          items: [venta],
          tipoPago: venta.tipoPago,
          // @ts-ignore
          notas: venta.notas || '',
          clienteNombre: venta.clienteId,
        });
      }
    });

    this.ticketsHistorial = grupos;
  }

  getNombreCliente(clienteId?: string): string {
    if (!clienteId) return 'Cliente Mostrador';
    const c = this.clientesLista.find((cli) => cli.id === clienteId);
    return c ? c.alias : 'Cliente Desconocido';
  }

  abrirEditarNota(ticket: TicketVenta) {
    this.ticketSeleccionado = ticket;
    this.notaEdicion = ticket.notas || '';
    this.modalEditarNotaVisible = true;
  }

  cerrarEditarVenta() {
    this.modalEditarNotaVisible = false;
    this.ticketSeleccionado = null;
  }

  async guardarNotaVenta() {
    if (!this.ticketSeleccionado) return;

    this.procesando = true;
    try {
      const promesas = this.ticketSeleccionado.items.map((item) =>
        this.ventasService.actualizarNotaVenta(item.id, this.notaEdicion)
      );

      await Promise.all(promesas);

      this.mostrarMensaje('Nota guardada');
      this.cerrarEditarVenta();
    } catch (error) {
      console.error(error);
      this.mostrarMensaje('Error al guardar nota', true);
    }
    this.procesando = false;
  }

  abrirModalCobrar() {
    if (this.carritoService.cantidadItems() === 0) {
      this.mostrarMensaje('Carrito vacío', true);
      return;
    }
    this.terminoBusqueda = '';
    this.filtrarClientes();
    this.modalCobroVisible = true;
  }

  async eliminarTicket() {
    if (!this.ticketSeleccionado) return;

    const confirmar = confirm(
      '¿Estás seguro de ELIMINAR esta venta? Se devolverá el stock y se ajustará la deuda.'
    );
    if (!confirmar) return;

    this.procesando = true;
    try {
      // Borramos cada venta individual del grupo
      const promesas = this.ticketSeleccionado.items.map((item) =>
        this.ventasService.eliminarVenta(item)
      );

      await Promise.all(promesas);

      this.mostrarMensaje('Venta eliminada correctamente');
      this.cerrarEditarVenta();
    } catch (error) {
      console.error(error);
      this.mostrarMensaje('Error al eliminar venta', true);
    }
    this.procesando = false;
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
