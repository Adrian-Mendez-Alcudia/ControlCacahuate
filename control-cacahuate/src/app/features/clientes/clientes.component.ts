import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ClientesService,
  DeudorInfo,
} from '../../core/services/clientes.service';
import { VentasService } from '../../core/services/ventas.service';
import { Cliente } from '../../core/models/interfaces';
import { formatearMoneda } from '../../core/utils/calculos.utils';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.scss',
})
export class ClientesComponent implements OnInit {
  private clientesService = inject(ClientesService);
  private ventasService = inject(VentasService);

  deudores$!: Observable<DeudorInfo[]>;
  todosClientes$!: Observable<Cliente[]>;
  dineroEnCalle$!: Observable<number>;

  // Modal abono
  modalAbonoVisible = false;
  clienteSeleccionado: DeudorInfo | null = null;
  montoAbono: number | null = null;
  notasAbono = '';

  // Modal nuevo cliente
  modalNuevoClienteVisible = false;
  nuevoCliente = {
    alias: '',
    telefono: '',
    notas: '',
  };

  // Estado
  guardando = false;
  mensaje = '';
  mensajeError = false;

  ngOnInit() {
    this.deudores$ = this.clientesService.getDeudores$();
    this.todosClientes$ = this.clientesService.getClientes$();
    this.dineroEnCalle$ = this.clientesService.getDineroEnCalle$();
  }

  formatearMoneda(valor: number): string {
    return formatearMoneda(valor);
  }

  // ========== ABONOS ==========

  abrirModalAbono(cliente: DeudorInfo) {
    this.clienteSeleccionado = cliente;
    this.montoAbono = null;
    this.notasAbono = '';
    this.modalAbonoVisible = true;
  }

  cerrarModalAbono() {
    this.modalAbonoVisible = false;
    this.clienteSeleccionado = null;
  }

  setMontoRapido(monto: number) {
    this.montoAbono = monto;
  }

  pagarTodo() {
    if (this.clienteSeleccionado) {
      this.montoAbono = this.clienteSeleccionado.saldoPendiente;
    }
  }

  async confirmarAbono() {
    if (!this.clienteSeleccionado || !this.montoAbono || this.montoAbono <= 0) {
      this.mostrarMensaje('Ingresa un monto válido', true);
      return;
    }

    if (this.montoAbono > this.clienteSeleccionado.saldoPendiente) {
      this.mostrarMensaje('El abono excede la deuda', true);
      return;
    }

    this.guardando = true;

    try {
      await this.clientesService.registrarAbono({
        clienteId: this.clienteSeleccionado.id,
        monto: this.montoAbono,
        notas: this.notasAbono || undefined,
      });

      // Registrar en caja
      await this.ventasService.registrarAbonoEnCaja(this.montoAbono);

      this.mostrarMensaje(
        `Abono de ${this.formatearMoneda(this.montoAbono)} registrado`
      );
      this.cerrarModalAbono();
    } catch (error: any) {
      console.error('Error al registrar abono:', error);
      this.mostrarMensaje(error.message || 'Error al registrar abono', true);
    }

    this.guardando = false;
  }

  // ========== NUEVO CLIENTE ==========

  abrirModalNuevoCliente() {
    this.nuevoCliente = { alias: '', telefono: '', notas: '' };
    this.modalNuevoClienteVisible = true;
  }

  cerrarModalNuevoCliente() {
    this.modalNuevoClienteVisible = false;
  }

  async crearCliente() {
    if (!this.nuevoCliente.alias.trim()) {
      this.mostrarMensaje('El nombre es requerido', true);
      return;
    }

    this.guardando = true;

    try {
      // CORRECCIÓN PRINCIPAL:
      // Firebase falla si envías 'undefined'.
      // Creamos un objeto dinámico solo con los datos que sí existen.
      const datosCliente: any = {
        alias: this.nuevoCliente.alias,
      };

      if (this.nuevoCliente.telefono && this.nuevoCliente.telefono.trim()) {
        datosCliente.telefono = this.nuevoCliente.telefono.trim();
      }

      if (this.nuevoCliente.notas && this.nuevoCliente.notas.trim()) {
        datosCliente.notas = this.nuevoCliente.notas.trim();
      }

      await this.clientesService.crearCliente(datosCliente);

      this.mostrarMensaje('Cliente creado');
      this.cerrarModalNuevoCliente();
    } catch (error) {
      console.error('Error al crear cliente:', error);
      this.mostrarMensaje('Error al crear cliente', true);
    }

    this.guardando = false;
  }

  // ========== UTILIDADES ==========

  private mostrarMensaje(texto: string, esError = false) {
    this.mensaje = texto;
    this.mensajeError = esError;
    setTimeout(() => {
      this.mensaje = '';
      this.mensajeError = false;
    }, 3000);
  }
}
