import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="skeleton"
      [class.circle]="shape === 'circle'"
      [style.width]="width"
      [style.height]="height"
      [style.border-radius]="borderRadius"
    ></div>
  `,
  styles: [
    `
      .skeleton {
        background: linear-gradient(
          90deg,
          #2d2d44 25%,
          #3d3d5c 50%,
          #2d2d44 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 8px; /* Default */
      }

      .circle {
        border-radius: 50% !important;
      }

      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
    `,
  ],
})
export class SkeletonComponent {
  @Input() width: string = '100%';
  @Input() height: string = '20px';
  @Input() shape: 'rectangle' | 'circle' = 'rectangle';
  @Input() borderRadius: string = '8px';
}
