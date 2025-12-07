import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { FormsModule } from '@angular/forms';
import {
  ClientesService,
  DeudorInfo,
} from '../../core/services/clientes.service';
import { VentasService } from '../../core/services/ventas.service';
import { NotificationService } from '../../core/services/notification.service';
import { Cliente } from '../../core/models/interfaces';
import { formatearMoneda } from '../../core/utils/calculos.utils';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.scss',
})
export class ClientesComponent implements OnInit {
  private clientesService = inject(ClientesService);
  private ventasService = inject(VentasService);
  private notificationService = inject(NotificationService);
  private fb = inject(FormBuilder);

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

  // FORMULARIO REACTIVO
  clienteForm: FormGroup;

  // Estado
  guardando = false;

  constructor() {
    this.clienteForm = this.fb.group({
      alias: ['', [Validators.required, Validators.minLength(3)]],
      telefono: ['', [Validators.pattern('^[0-9]{10}$')]],
      notas: [''],
    });
  }

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
      this.notificationService.error('Ingresa un monto válido');
      return;
    }

    if (this.montoAbono > this.clienteSeleccionado.saldoPendiente) {
      this.notificationService.error('El abono excede la deuda');
      return;
    }

    this.guardando = true;

    try {
      await this.clientesService.registrarAbono({
        clienteId: this.clienteSeleccionado.id,
        monto: this.montoAbono,
        notas: this.notasAbono || undefined,
      });

      await this.ventasService.registrarAbonoEnCaja(this.montoAbono);

      this.notificationService.success(
        `Abono de ${this.formatearMoneda(this.montoAbono)} registrado`
      );
      this.cerrarModalAbono();
    } catch (error: any) {
      this.notificationService.error('Error al registrar abono');
    }

    this.guardando = false;
  }

  // ========== NUEVO CLIENTE ==========

  abrirModalNuevoCliente() {
    this.clienteForm.reset();
    this.modalNuevoClienteVisible = true;
  }

  cerrarModalNuevoCliente() {
    this.modalNuevoClienteVisible = false;
  }

  async crearCliente() {
    if (this.clienteForm.invalid) {
      this.clienteForm.markAllAsTouched();
      return;
    }

    this.guardando = true;
    const formValues = this.clienteForm.value;

    try {
      await this.clientesService.crearCliente({
        alias: formValues.alias,
        telefono: formValues.telefono || undefined,
        notas: formValues.notas || undefined,
      });

      this.notificationService.success('Cliente creado correctamente');
      this.cerrarModalNuevoCliente();
    } catch (error) {
      console.error(error);
    }

    this.guardando = false;
  }

  // ========== ELIMINAR CLIENTE (NUEVO) ==========

  async eliminarCliente(cliente: Cliente) {
    if (cliente.saldoPendiente > 0) {
      this.notificationService.error(
        `No puedes eliminar a ${cliente.alias} porque tiene deuda pendiente.`
      );
      return;
    }

    const confirmacion = confirm(
      `¿Estás seguro de eliminar a "${cliente.alias}" permanentemente?`
    );

    if (!confirmacion) return;

    try {
      const resultado = await this.clientesService.eliminarCliente(cliente.id);

      if (resultado.success) {
        this.notificationService.success('Cliente eliminado');
      } else {
        this.notificationService.error(
          resultado.error || 'No se pudo eliminar'
        );
      }
    } catch (error) {
      console.error(error);
    }
  }
}
