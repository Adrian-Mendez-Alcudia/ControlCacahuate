import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../core/services/notification.service';
import { animate, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      @for (toast of notificationService.notifications(); track toast.id) {
      <div
        class="toast"
        [class]="toast.type"
        @fadeAnimation
        (click)="notificationService.remove(toast.id)"
      >
        <span class="icon">
          @switch (toast.type) { @case ('success') { ✅ } @case ('error') { ❌ }
          @case ('warning') { ⚠️ } @default { ℹ️ } }
        </span>
        <span class="message">{{ toast.message }}</span>
      </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none; /* Para que los clicks pasen a través del contenedor vacío */
      }

      .toast {
        pointer-events: auto;
        min-width: 300px;
        padding: 16px;
        border-radius: 12px;
        background: #2d2d44;
        color: white;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        border-left: 5px solid #888;
        backdrop-filter: blur(10px);

        &.success {
          border-left-color: #22c55e;
          background: rgba(34, 197, 94, 0.1);
        }
        &.error {
          border-left-color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
        }
        &.warning {
          border-left-color: #f59e0b;
          background: rgba(245, 158, 11, 0.1);
        }

        .message {
          font-size: 14px;
          font-weight: 500;
        }
      }
    `,
  ],
  animations: [
    trigger('fadeAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(50px)' }),
        animate(
          '300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          style({ opacity: 1, transform: 'translateX(0)' })
        ),
      ]),
      transition(':leave', [
        animate(
          '300ms ease-out',
          style({ opacity: 0, transform: 'translateX(50px)' })
        ),
      ]),
    ]),
  ],
})
export class ToastComponent {
  notificationService = inject(NotificationService);
}
