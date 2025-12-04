import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SaboresService } from '../../core/services/sabores.service';
import { ConfiguracionService } from '../../core/services/configuracion.service';
import {
  Sabor,
  COLORES_DISPONIBLES,
  EMOJIS_SUGERIDOS,
} from '../../core/models/interfaces';
import { formatearMoneda } from '../../core/utils/calculos.utils';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './configuracion.component.html',
  styleUrl: './configuracion.component.scss',
})
export class ConfiguracionComponent implements OnInit {
  private saboresService = inject(SaboresService);
  private configuracionService = inject(ConfiguracionService);

  sabores$!: Observable<Sabor[]>;

  // Configuración del negocio
  precioVenta = 10;
  nombreNegocio = 'Control Cacahuate';

  // Modal de sabor
  modalSaborVisible = false;
  editandoSabor: Sabor | null = null;
  nuevoSabor = {
    nombre: '',
    emoji: '🥜',
    color: '#F59E0B',
  };

  // Opciones
  coloresDisponibles = COLORES_DISPONIBLES;
  emojisDisponibles = EMOJIS_SUGERIDOS;

  // Estado
  guardando = false;
  mensaje = '';

  ngOnInit() {
    this.sabores$ = this.saboresService.getTodosSabores$();

    this.configuracionService.config$.subscribe((config) => {
      if (config) {
        this.precioVenta = config.precioVentaDefault;
        this.nombreNegocio = config.nombreNegocio;
      }
    });
  }

  formatearMoneda(valor: number): string {
    return formatearMoneda(valor);
  }

  // ========== CONFIGURACIÓN ==========

  async guardarPrecio() {
    if (this.precioVenta <= 0) {
      this.mostrarMensaje('El precio debe ser mayor a 0', true);
      return;
    }

    this.guardando = true;
    try {
      await this.configuracionService.actualizarPrecioVenta(this.precioVenta);
      this.mostrarMensaje('Precio actualizado');
    } catch (error) {
      this.mostrarMensaje('Error al guardar', true);
    }
    this.guardando = false;
  }

  async guardarNombre() {
    if (!this.nombreNegocio.trim()) {
      this.mostrarMensaje('El nombre no puede estar vacío', true);
      return;
    }

    this.guardando = true;
    try {
      await this.configuracionService.actualizarNombreNegocio(
        this.nombreNegocio
      );
      this.mostrarMensaje('Nombre actualizado');
    } catch (error) {
      this.mostrarMensaje('Error al guardar', true);
    }
    this.guardando = false;
  }

  // ========== SABORES ==========

  abrirModalNuevoSabor() {
    this.editandoSabor = null;
    this.nuevoSabor = {
      nombre: '',
      emoji: '🥜',
      color: '#F59E0B',
    };
    this.modalSaborVisible = true;
  }

  abrirModalEditarSabor(sabor: Sabor) {
    this.editandoSabor = sabor;
    this.nuevoSabor = {
      nombre: sabor.nombre,
      emoji: sabor.emoji,
      color: sabor.color,
    };
    this.modalSaborVisible = true;
  }

  cerrarModalSabor() {
    this.modalSaborVisible = false;
    this.editandoSabor = null;
  }

  seleccionarColor(color: string) {
    this.nuevoSabor.color = color;
  }

  seleccionarEmoji(emoji: string) {
    this.nuevoSabor.emoji = emoji;
  }

  async guardarSabor() {
    if (!this.nuevoSabor.nombre.trim()) {
      this.mostrarMensaje('El nombre es requerido', true);
      return;
    }

    this.guardando = true;

    try {
      if (this.editandoSabor) {
        await this.saboresService.actualizarSabor(
          this.editandoSabor.id,
          this.nuevoSabor
        );
        this.mostrarMensaje('Sabor actualizado');
      } else {
        await this.saboresService.crearSabor(this.nuevoSabor);
        this.mostrarMensaje('Sabor creado');
      }
      this.cerrarModalSabor();
    } catch (error) {
      this.mostrarMensaje('Error al guardar', true);
    }

    this.guardando = false;
  }

  async toggleActivoSabor(sabor: Sabor) {
    try {
      if (sabor.activo) {
        await this.saboresService.desactivarSabor(sabor.id);
        this.mostrarMensaje('Sabor desactivado');
      } else {
        await this.saboresService.reactivarSabor(sabor.id);
        this.mostrarMensaje('Sabor activado');
      }
    } catch (error) {
      this.mostrarMensaje('Error al actualizar', true);
    }
  }

  async eliminarSabor(sabor: Sabor) {
    if (!confirm(`¿Eliminar "${sabor.nombre}" permanentemente?`)) {
      return;
    }

    try {
      await this.saboresService.eliminarSabor(sabor.id);
      this.mostrarMensaje('Sabor eliminado');
    } catch (error) {
      this.mostrarMensaje('Error al eliminar', true);
    }
  }

  private mostrarMensaje(texto: string, esError = false) {
    this.mensaje = texto;
    setTimeout(() => (this.mensaje = ''), 3000);
  }
}
