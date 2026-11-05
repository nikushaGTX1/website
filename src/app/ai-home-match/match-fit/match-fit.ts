import { NgClass, NgFor, NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';
import type { LifestyleInsight } from '../services/match-explanations';

@Component({
  selector: 'app-match-fit',
  imports: [NgClass, NgFor, NgIf],
  templateUrl: './match-fit.html',
  styleUrl: './match-fit.css',
})
export class MatchFit {
  @Input({ required: true }) items: LifestyleInsight[] = [];
  @Input() exact = false;
}
